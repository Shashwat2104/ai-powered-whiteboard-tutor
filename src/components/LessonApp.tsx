"use client";

// Architectural justification: LessonApp is the central application orchestrator that coordinates
// the deterministic audio clock, whiteboard projection, session persistence/recovery, transcript,
// and contextual follow-up chat in a unified reactive state tree. Keeping this coordination centralized
// prevents synchronization race conditions between the audio element and the SVG canvas.

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { Lesson, Difficulty } from "@/lib/lesson/schema";
import { resolveTimeline, type Timeline } from "@/lib/timeline/resolve";
import { estimateAudio } from "@/lib/timeline/estimate";
import { boardStateAt, type BoardState } from "@/lib/board/state";
import { buildPlayable, type Playable } from "@/lib/client/build-playable";
import { narrateLesson } from "@/lib/client/narrate";
import { postLesson, ClientError, type TtsProviderName } from "@/lib/client/api";
import { initSyncProbe } from "@/lib/client/probe";
import { PlaybackController } from "@/lib/playback/controller";
import { usePlayback } from "@/lib/client/usePlayback";
import { useShortcuts } from "@/lib/client/useShortcuts";
import { useReducedMotion } from "@/lib/client/useReducedMotion";
import { stripMarkers } from "@/lib/lesson/markers";
import {
  saveSession,
  savePosition,
  saveAudioBlob,
  restoreSession,
  clearSession,
} from "@/lib/session/persist";
import { TopicForm } from "./topic/TopicForm";
import { ProgressSteps, type GenerationStage } from "./status/ProgressSteps";
import { ErrorNotice } from "./status/ErrorNotice";
import { ProvenanceNote, type VoiceSource } from "./status/ProvenanceNote";
import { Whiteboard } from "./whiteboard/Whiteboard";
import { PlayerControls } from "./player/PlayerControls";
import { KnowledgeCheck } from "./check/KnowledgeCheck";
import { FollowUpPanel, type ChatTurn } from "./chat/FollowUpPanel";
import { Transcript } from "./transcript/Transcript";
import { CaptionBar } from "./transcript/CaptionBar";
import type { LessonContext } from "@/lib/followup/schema";
import { Play } from "lucide-react";

const ALL_TTS_PROVIDERS: readonly TtsProviderName[] = ["elevenlabs", "google"];

/** Every voice provider, with the preferred one (the voice a lesson was first recorded in) first. */
function voicesPreferring(preferred: string | undefined): TtsProviderName[] {
  const first = ALL_TTS_PROVIDERS.find((p) => p === preferred);
  return first ? [first, ...ALL_TTS_PROVIDERS.filter((p) => p !== first)] : [...ALL_TTS_PROVIDERS];
}

const EMPTY_BOARD: BoardState = {
  sceneId: "",
  activeSegmentId: "",
  elements: [],
};

interface LessonAppProps {
  audioRef?: React.RefObject<HTMLAudioElement | null>;
}

export function LessonApp({ audioRef }: LessonAppProps) {
  const controller = useMemo(() => new PlaybackController(), []);
  const {
    initAudio,
    initVirtualClock,
    seek,
    positionSec,
    isPlaying,
    isReady,
    isEnded,
    needsUserGesture,
    audioTrouble,
    retryAudio,
    continueWithoutAudio,
  } = usePlayback(controller);

  const reducedMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<"transcript" | "chat">("transcript");

  const [stage, setStage] = useState<GenerationStage>("idle");
  const [narrationProgress, setNarrationProgress] = useState<{ completed: number; total: number }>({
    completed: 0,
    total: 0,
  });
  const [currentError, setCurrentError] = useState<ClientError | Error | string | null>(null);
  const [isNoAudio, setIsNoAudio] = useState(false);
  const [voice, setVoice] = useState<VoiceSource | undefined>(undefined);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [conversationTurns, setConversationTurns] = useState<ChatTurn[]>([]);
  const [restoredPosition, setRestoredPosition] = useState<number>(0);

  const [inFlightTopic, setInFlightTopic] = useState<string | null>(null);
  const [currentDifficulty, setCurrentDifficulty] = useState<Difficulty>("beginner");

  const [boardState, setBoardState] = useState<BoardState>(EMPTY_BOARD);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const lastSavedTimeRef = useRef<number>(0);
  const [lastSubmittedTopic, setLastSubmittedTopic] = useState<string>("");
  const lastNarrationTokensRef = useRef<Record<string, string>>({});
  const lastNarrationExpiresRef = useRef<string | undefined>(undefined);
  const lastProviderOrderRef = useRef<TtsProviderName[]>([...ALL_TTS_PROVIDERS]);

  // Global playback keyboard shortcuts (Space, ArrowLeft/Right, Home)
  useShortcuts({ controller, enabled: isReady });

  // Restore session on initial load
  useEffect(() => {
    let isMounted = true;

    async function loadRestoredSession() {
      const restored = await restoreSession();
      if (!restored || !isMounted) return;

      const restoredLesson = restored.lesson;
      setLesson(restoredLesson);
      const resolvedTimeline =
        restored.timeline ?? resolveTimeline(restoredLesson, estimateAudio(restoredLesson));
      setTimeline(resolvedTimeline);
      setConversationTurns(restored.conversation);
      setRestoredPosition(restored.positionSec);
      lastNarrationTokensRef.current = restored.narrationTokens;
      lastNarrationExpiresRef.current = restored.narrationExpiresAt;

      if (restored.audioBlob) {
        const url = URL.createObjectURL(restored.audioBlob);
        setAudioUrl(url);
        setVoice(voicesPreferring(restored.ttsProvider)[0]);
        setStage("ready");
      } else {
        const isExpired =
          !restored.narrationExpiresAt ||
          new Date(restored.narrationExpiresAt).getTime() < Date.now();

        if (isExpired) {
          setRestoreNotice("Your previous lesson couldn't be fully restored.");
          setIsNoAudio(true);
          initVirtualClock(resolvedTimeline.totalSec);
          setStage("ready");
          if (restored.positionSec > 0) {
            controller.seek(restored.positionSec);
          }
        } else {
          setStage("narrating");
          try {
            const narrated = await narrateLesson(restoredLesson, {
              providerOrder: voicesPreferring(restored.ttsProvider),
              tokens: restored.narrationTokens,
            });
            const playable = buildPlayable(restoredLesson, narrated);
            setVoice(narrated.provider);
            if (playable.audio && !playable.noAudio) {
              await saveAudioBlob(restoredLesson.id, playable.audio);
              const url = URL.createObjectURL(playable.audio);
              setAudioUrl(url);
              const audioEl = audioElRef.current ?? new Audio();
              audioEl.src = url;
              initAudio(audioEl, resolvedTimeline.totalSec);
            } else {
              setIsNoAudio(true);
              initVirtualClock(resolvedTimeline.totalSec);
            }
            setStage("ready");
          } catch {
            setIsNoAudio(true);
            initVirtualClock(resolvedTimeline.totalSec);
            setStage("ready");
          }
        }
      }
    }

    void loadRestoredSession();

    return () => {
      isMounted = false;
    };
  }, [initVirtualClock, initAudio, controller]);

  // Synchronize rAF board state with controller's live position & save position at most once per 2s
  useEffect(() => {
    if (!lesson || !timeline) return;

    let frameId: number | undefined;

    const renderFrame = () => {
      const t = controller.getPosition();
      setBoardState(boardStateAt(lesson, timeline, t, { reducedMotion }));

      const now = performance.now();
      if (now - lastSavedTimeRef.current >= 2000) {
        lastSavedTimeRef.current = now;
        savePosition(t);
      }

      if (controller.getSnapshot().mode === "playing") {
        frameId = requestAnimationFrame(renderFrame);
      }
    };

    frameId = requestAnimationFrame(renderFrame);

    return () => {
      if (frameId !== undefined) cancelAnimationFrame(frameId);
    };
  }, [lesson, timeline, controller, positionSec, isPlaying, reducedMotion]);

  // Audio setup when audioUrl or timeline changes
  const handleAudioLoadedMetadata = useCallback(() => {
    if (audioElRef.current && timeline) {
      initAudio(audioElRef.current, timeline.totalSec);
      if (restoredPosition > 0) {
        controller.seek(restoredPosition);
        setRestoredPosition(0);
      }
    }
  }, [initAudio, timeline, restoredPosition, controller]);

  const handleTopicSubmit = async (topic: string, difficulty: Difficulty) => {
    // Supersession: Abort any pending generation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    setLastSubmittedTopic(topic);
    setInFlightTopic(topic);
    setCurrentDifficulty(difficulty);
    setCurrentError(null);
    setRestoreNotice(null);
    setIsNoAudio(false);
    setStage("writing");
    setNarrationProgress({ completed: 0, total: 0 });
    controller.startGenerating();

    // Clear prior browser session on new generation
    await clearSession();

    try {
      // Step 1: Generate lesson
      const lessonResult = await postLesson(
        { topic, difficulty },
        abortCtrl.signal,
      );

      const currentLesson = lessonResult.lesson;
      setLesson(currentLesson);
      setStage("narrating");
      controller.startNarrating();

      lastNarrationTokensRef.current = lessonResult.narration.tokens;
      lastNarrationExpiresRef.current = lessonResult.narration.expiresAt;
      lastProviderOrderRef.current = [...lessonResult.narration.providerOrder];

      // Step 2: Synthesize narration
      const narrated = await narrateLesson(currentLesson, lessonResult.narration, {
        signal: abortCtrl.signal,
        onProgress: (done, total) => {
          setNarrationProgress({ completed: done, total });
        },
      });

      // Step 3: Build playable track and timeline
      const playable: Playable = buildPlayable(currentLesson, narrated);
      setVoice(narrated.provider);
      setTimeline(playable.timeline);
      initSyncProbe(currentLesson, playable.timeline);

      if (playable.audio && !playable.noAudio) {
        const url = URL.createObjectURL(playable.audio);
        setAudioUrl(url);
        setIsNoAudio(false);
        await saveAudioBlob(currentLesson.id, playable.audio);
      } else {
        setAudioUrl(null);
        setIsNoAudio(true);
        initVirtualClock(playable.timeline.totalSec);
      }

      // Persist session
      await saveSession({
        lesson: currentLesson,
        timeline: playable.timeline,
        narrationTokens: lessonResult.narration.tokens,
        narrationExpiresAt: lessonResult.narration.expiresAt,
        ttsProvider: narrated.provider,
        conversation: [],
        positionSec: 0,
      });

      setStage("ready");
      setInFlightTopic(null);
    } catch (err) {
      if (err instanceof ClientError && err.kind === "aborted") {
        return;
      }
      setInFlightTopic(null);
      setCurrentError(err instanceof Error ? err : String(err));
      setStage("error");
      controller.fail("generation");
    }
  };

  const handleRetryNarration = async () => {
    if (!lesson || !timeline) return;
    setIsNoAudio(false);
    setStage("narrating");
    try {
      const narrated = await narrateLesson(lesson, {
        providerOrder: lastProviderOrderRef.current,
        tokens: lastNarrationTokensRef.current,
      });
      const playable = buildPlayable(lesson, narrated);
      setVoice(narrated.provider);
      if (playable.audio && !playable.noAudio) {
        await saveAudioBlob(lesson.id, playable.audio);
        const url = URL.createObjectURL(playable.audio);
        setAudioUrl(url);
        setIsNoAudio(false);
      } else {
        setIsNoAudio(true);
        initVirtualClock(timeline.totalSec);
      }
      setStage("ready");
    } catch {
      setIsNoAudio(true);
      setStage("ready");
    }
  };

  const handleConversationChange = useCallback(
    (turns: ChatTurn[]) => {
      setConversationTurns(turns);
      if (lesson) {
        void saveSession({
          lesson,
          timeline: timeline ?? undefined,
          narrationTokens: lastNarrationTokensRef.current,
          narrationExpiresAt: lastNarrationExpiresRef.current,
          conversation: turns,
          positionSec: controller.getPosition(),
        });
      }
    },
    [lesson, timeline, controller]
  );

  const handleSeekScene = useCallback(
    (sceneId: string) => {
      if (!timeline) return;
      const targetScene = timeline.scenes.find((s) => s.id === sceneId);
      if (targetScene) {
        seek(targetScene.startSec);
        void controller.play();
      }
    },
    [timeline, seek, controller],
  );

  const handleSeekSegment = useCallback(
    (_segId: string, startSec: number) => {
      seek(startSec);
      void controller.play();
    },
    [seek, controller],
  );

  const activeSceneTitle = useMemo(() => {
    if (!lesson || !boardState.sceneId) return undefined;
    return lesson.scenes.find((s) => s.id === boardState.sceneId)?.title;
  }, [lesson, boardState.sceneId]);

  const activeSegment = useMemo(() => {
    if (!lesson || !boardState.activeSegmentId) return undefined;
    return lesson.segments.find((s) => s.id === boardState.activeSegmentId);
  }, [lesson, boardState.activeSegmentId]);

  const activeSegmentText = useMemo(() => {
    if (!activeSegment) return undefined;
    return stripMarkers(activeSegment.text);
  }, [activeSegment]);

  const sceneMarkers = useMemo(() => {
    if (!timeline || !lesson) return undefined;
    const titlesById = new Map(lesson.scenes.map((s) => [s.id, s.title]));
    return timeline.scenes.map((s) => ({
      ...s,
      title: titlesById.get(s.id),
    }));
  }, [timeline, lesson]);

  const lessonContext = useMemo<LessonContext | null>(() => {
    if (!lesson) return null;
    return {
      lessonId: lesson.id,
      topic: lesson.topic,
      objective: lesson.objective,
      difficulty: lesson.difficulty,
      transcript: lesson.segments.map((s) => ({
        segmentId: s.id,
        sceneId: lesson.scenes.find((sc) => sc.segmentIds.includes(s.id))?.id ?? "",
        text: s.text,
      })),
      scenes: lesson.scenes.map((sc) => ({ id: sc.id, title: sc.title })),
      recap: lesson.recap.keyPoints,
    };
  }, [lesson]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto py-4 px-2 sm:px-4">
      {/* Hidden Audio Element for Lesson Narration Clock */}
      <audio
        ref={(el) => {
          audioElRef.current = el;
          if (audioRef) audioRef.current = el;
        }}
        src={audioUrl ?? undefined}
        onLoadedMetadata={handleAudioLoadedMetadata}
        preload="auto"
        playsInline
        className="hidden"
        aria-hidden="true"
      />

      {/* Topic Input Form */}
      <TopicForm
        onSubmit={handleTopicSubmit}
        isLoading={stage === "writing" || stage === "narrating"}
        inFlightTopic={inFlightTopic ?? undefined}
        initialTopic={lesson?.topic ?? ""}
      />

      {/* Progress Feedback */}
      <ProgressSteps stage={stage} narrationProgress={narrationProgress} />

      {/* Restored Session Notice */}
      {restoreNotice && (
        <div
          role="status"
          className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-sm text-amber-800 dark:text-amber-200 max-w-2xl mx-auto w-full flex items-center justify-between gap-3"
        >
          <span>{restoreNotice}</span>
          <button
            type="button"
            onClick={() => handleTopicSubmit(lesson?.topic || "", currentDifficulty)}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
          >
            Regenerate
          </button>
        </div>
      )}

      {/* Error Notice */}
      {currentError && (
        <ErrorNotice
          error={currentError}
          onRetry={
            lastSubmittedTopic
              ? () => handleTopicSubmit(lastSubmittedTopic, currentDifficulty)
              : undefined
          }
          onEditTopic={() => {
            const el = document.getElementById("topic-input");
            el?.focus();
          }}
          className="max-w-2xl mx-auto w-full"
        />
      )}

      {/* Audio Trouble Notice */}
      {audioTrouble && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-sm text-amber-800 dark:text-amber-200 max-w-2xl mx-auto w-full flex flex-wrap items-center justify-between gap-3"
        >
          <span>Audio is having trouble loading.</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={retryAudio}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={continueWithoutAudio}
              className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold cursor-pointer"
            >
              Continue without audio
            </button>
          </div>
        </div>
      )}

      {/* No Audio Notice */}
      {isNoAudio && isReady && (
        <div
          role="status"
          className="p-4 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/80 text-sm text-amber-900 dark:text-amber-200 max-w-2xl mx-auto w-full flex flex-wrap items-center justify-between gap-3 shadow-xs"
        >
          <span>
            Narration audio is unavailable right now. You can follow along with the transcript and
            whiteboard.
          </span>
          <button
            type="button"
            onClick={handleRetryNarration}
            className="px-3.5 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold shadow-xs cursor-pointer min-h-[38px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Try audio again
          </button>
        </div>
      )}

      {/* Whiteboard Canvas & Live Captions */}
      <div className="flex flex-col gap-2.5">
        <div className="relative">
          <Whiteboard
            boardState={boardState}
            sceneTitle={activeSceneTitle}
            activeSegmentId={boardState.activeSegmentId}
          />

          {/* Autoplay blocked gesture prompt overlay */}
          {needsUserGesture && (
            <div
              data-testid="autoplay-overlay"
              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/70 backdrop-blur-xs text-white rounded-2xl"
            >
              <button
                type="button"
                onClick={() => void controller.play()}
                className="px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold shadow-md transition-all flex items-center gap-2 text-base cursor-pointer min-h-[44px] focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Press play to start</span>
              </button>
            </div>
          )}
        </div>

        {/* Live Narration Caption Bar */}
        {isReady && <CaptionBar currentText={activeSegmentText} />}
        {isReady && <ProvenanceNote model={lesson?.generatedBy.model} voice={isNoAudio ? "none" : voice} />}

        {/* Playback Controls */}
        {isReady && (
          <div className="mt-1">
            <PlayerControls controller={controller} scenes={sceneMarkers} />
          </div>
        )}
      </div>

      {/* Knowledge Check at End or when Available */}
      {lesson && lesson.knowledgeChecks.length > 0 && (isEnded || isReady) && (
        <div className="mt-2">
          <KnowledgeCheck checks={lesson.knowledgeChecks} onSeekScene={handleSeekScene} />
        </div>
      )}

      {/* Responsive Transcript and Follow-up Questions */}
      {lesson && timeline && lessonContext && (
        <div className="mt-4 flex flex-col gap-4">
          {/* Mobile Tab Switcher (< 768px) */}
          <div className="flex md:hidden border-b border-slate-200" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "transcript"}
              aria-controls="mobile-tab-transcript"
              id="tab-transcript"
              onClick={() => setActiveTab("transcript")}
              className={`flex-1 py-2.5 text-center text-sm font-semibold border-b-2 transition-colors min-h-[44px] ${
                activeTab === "transcript"
                  ? "border-indigo-600 text-indigo-600 bg-indigo-50/50"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Transcript
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "chat"}
              aria-controls="mobile-tab-chat"
              id="tab-chat"
              onClick={() => setActiveTab("chat")}
              className={`flex-1 py-2.5 text-center text-sm font-semibold border-b-2 transition-colors min-h-[44px] ${
                activeTab === "chat"
                  ? "border-indigo-600 text-indigo-600 bg-indigo-50/50"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Ask Tutor
            </button>
          </div>

          {/* Mobile Tab Content (< 768px) */}
          <div className="md:hidden">
            {activeTab === "transcript" ? (
              <div
                id="mobile-tab-transcript"
                role="tabpanel"
                aria-labelledby="tab-transcript"
                className="h-[440px]"
              >
                <Transcript
                  lesson={lesson}
                  timeline={timeline}
                  activeSegmentId={boardState.activeSegmentId}
                  onSeekSegment={handleSeekSegment}
                  reducedMotion={reducedMotion}
                />
              </div>
            ) : (
              <div
                id="mobile-tab-chat"
                role="tabpanel"
                aria-labelledby="tab-chat"
                className="h-[440px]"
              >
                <FollowUpPanel
                  key={lesson.id}
                  lessonContext={lessonContext}
                  onJumpToScene={handleSeekScene}
                  initialTurns={conversationTurns}
                  onTurnsChange={handleConversationChange}
                />
              </div>
            )}
          </div>

          {/* Desktop Side-by-Side Content (>= 768px) */}
          <div className="hidden md:grid md:grid-cols-2 gap-6 h-[500px]">
            <Transcript
              lesson={lesson}
              timeline={timeline}
              activeSegmentId={boardState.activeSegmentId}
              onSeekSegment={handleSeekSegment}
              reducedMotion={reducedMotion}
            />
            <FollowUpPanel
              key={lesson.id}
              lessonContext={lessonContext}
              onJumpToScene={handleSeekScene}
              initialTurns={conversationTurns}
              onTurnsChange={handleConversationChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
