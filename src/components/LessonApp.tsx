"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { Lesson, Difficulty } from "@/lib/lesson/schema";
import type { Timeline } from "@/lib/timeline/resolve";
import { boardStateAt, type BoardState } from "@/lib/board/state";
import { buildPlayable, type Playable } from "@/lib/client/build-playable";
import { narrateLesson } from "@/lib/client/narrate";
import { postLesson } from "@/lib/client/api";
import { ClientError } from "@/lib/client/api";
import { initSyncProbe } from "@/lib/client/probe";
import { PlaybackController } from "@/lib/playback/controller";
import { usePlayback } from "@/lib/client/usePlayback";
import { useShortcuts } from "@/lib/client/useShortcuts";
import { useReducedMotion } from "@/lib/client/useReducedMotion";
import { stripMarkers } from "@/lib/lesson/markers";
import { TopicForm } from "./topic/TopicForm";
import { ProgressSteps, type GenerationStage } from "./status/ProgressSteps";
import { Whiteboard } from "./whiteboard/Whiteboard";
import { PlayerControls } from "./player/PlayerControls";
import { KnowledgeCheck } from "./check/KnowledgeCheck";
import { FollowUpPanel } from "./chat/FollowUpPanel";
import { Transcript } from "./transcript/Transcript";
import { CaptionBar } from "./transcript/CaptionBar";
import type { LessonContext } from "@/lib/followup/schema";

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
  } = usePlayback(controller);

  const reducedMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<"transcript" | "chat">("transcript");

  const [stage, setStage] = useState<GenerationStage>("idle");
  const [narrationProgress, setNarrationProgress] = useState<{ completed: number; total: number }>({
    completed: 0,
    total: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const [boardState, setBoardState] = useState<BoardState>(EMPTY_BOARD);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // Global playback keyboard shortcuts (Space, ArrowLeft/Right, Home)
  useShortcuts({ controller, enabled: isReady });

  // Synchronize rAF board state with controller's live position
  useEffect(() => {
    if (!lesson || !timeline) return;

    let frameId: number | undefined;

    const renderFrame = () => {
      const t = controller.getPosition();
      setBoardState(boardStateAt(lesson, timeline, t, { reducedMotion }));

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
    }
  }, [initAudio, timeline]);

  const handleTopicSubmit = async (topic: string, difficulty: Difficulty) => {
    // Abort any pending generation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    setError(null);
    setStage("writing");
    setNarrationProgress({ completed: 0, total: 0 });
    controller.startGenerating();

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

      // Step 2: Synthesize narration
      const narrated = await narrateLesson(currentLesson, lessonResult.narration, {
        signal: abortCtrl.signal,
        onProgress: (done, total) => {
          setNarrationProgress({ completed: done, total });
        },
      });

      // Step 3: Build playable track and timeline
      const playable: Playable = buildPlayable(currentLesson, narrated);
      setTimeline(playable.timeline);
      initSyncProbe(currentLesson, playable.timeline);

      if (playable.audio && !playable.noAudio) {
        const url = URL.createObjectURL(playable.audio);
        setAudioUrl(url);
      } else {
        setAudioUrl(null);
        initVirtualClock(playable.timeline.totalSec);
      }

      setStage("ready");
    } catch (err) {
      if (err instanceof ClientError && err.kind === "aborted") {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to generate lesson. Please try again.";
      setError(message);
      setStage("error");
      controller.fail("generation");
    }
  };

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
        initialTopic={lesson?.topic ?? ""}
      />

      {/* Progress & Error Feedback */}
      <ProgressSteps stage={stage} narrationProgress={narrationProgress} />

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300 max-w-2xl mx-auto w-full"
        >
          {error}
        </div>
      )}

      {/* Whiteboard Canvas & Live Captions */}
      <div className="flex flex-col gap-2">
        <Whiteboard
          boardState={boardState}
          sceneTitle={activeSceneTitle}
          activeSegmentId={boardState.activeSegmentId}
        />

        {/* Live Narration Caption Bar */}
        {isReady && <CaptionBar currentText={activeSegmentText} />}

        {/* Playback Controls */}
        {isReady && (
          <div className="mt-1">
            <PlayerControls
              controller={controller}
              scenes={sceneMarkers}
            />
          </div>
        )}
      </div>

      {/* Knowledge Check at End or when Available */}
      {lesson && lesson.knowledgeChecks.length > 0 && (isEnded || isReady) && (
        <div className="mt-2">
          <KnowledgeCheck
            checks={lesson.knowledgeChecks}
            onSeekScene={handleSeekScene}
          />
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
              <div id="mobile-tab-transcript" role="tabpanel" aria-labelledby="tab-transcript" className="h-[440px]">
                <Transcript
                  lesson={lesson}
                  timeline={timeline}
                  activeSegmentId={boardState.activeSegmentId}
                  onSeekSegment={handleSeekSegment}
                  reducedMotion={reducedMotion}
                />
              </div>
            ) : (
              <div id="mobile-tab-chat" role="tabpanel" aria-labelledby="tab-chat" className="h-[440px]">
                <FollowUpPanel
                  lessonContext={lessonContext}
                  onJumpToScene={handleSeekScene}
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
              lessonContext={lessonContext}
              onJumpToScene={handleSeekScene}
            />
          </div>
        </div>
      )}
    </div>
  );
}
