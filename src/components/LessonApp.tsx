"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { Lesson, Difficulty } from "@/lib/lesson/schema";
import type { Timeline } from "@/lib/timeline/resolve";
import { boardStateAt, type BoardState } from "@/lib/board/state";
import { PlaybackController } from "@/lib/playback/controller";
import { usePlayback } from "@/lib/client/usePlayback";
import { postLesson, ClientError } from "@/lib/client/api";
import { narrateLesson } from "@/lib/client/narrate";
import { buildPlayable, type Playable } from "@/lib/client/build-playable";
import { TopicForm } from "./topic/TopicForm";
import { ProgressSteps, type GenerationStage } from "./status/ProgressSteps";
import { Whiteboard } from "./whiteboard/Whiteboard";
import { PlayerControls } from "./player/PlayerControls";
import { KnowledgeCheck } from "./check/KnowledgeCheck";

const EMPTY_BOARD: BoardState = {
  sceneId: "",
  activeSegmentId: "",
  elements: [],
};

export function LessonApp() {
  const controller = useMemo(() => new PlaybackController(), []);
  const {
    snapshot,
    isPlaying,
    isEnded,
    isReady,
    positionSec,
    audioRef,
    initAudio,
    initVirtualClock,
    seek,
  } = usePlayback(controller);

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

  // Synchronize rAF board state with controller's live position
  useEffect(() => {
    if (!lesson || !timeline) {
      setBoardState(EMPTY_BOARD);
      return;
    }

    let frameId: number | undefined;

    const renderFrame = () => {
      const t = controller.getPosition();
      const nextBoard = boardStateAt(lesson, timeline, t, { reducedMotion: false });
      setBoardState(nextBoard);

      if (controller.getSnapshot().mode === "playing") {
        frameId = requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();

    return () => {
      if (frameId !== undefined) cancelAnimationFrame(frameId);
    };
  }, [lesson, timeline, controller, positionSec, isPlaying]);

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
        abortCtrl.signal
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
    [timeline, seek, controller]
  );

  const activeSceneTitle = useMemo(() => {
    if (!lesson || !boardState.sceneId) return undefined;
    return lesson.scenes.find((s) => s.id === boardState.sceneId)?.title;
  }, [lesson, boardState.sceneId]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto py-6 px-4 sm:px-6">
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

      {/* Whiteboard Canvas */}
      <div className="flex flex-col gap-3">
        <Whiteboard boardState={boardState} sceneTitle={activeSceneTitle} />
        {isReady && <PlayerControls controller={controller} />}
      </div>

      {/* Knowledge Check at End or when Available */}
      {lesson && lesson.knowledgeChecks.length > 0 && (isEnded || isReady) && (
        <div className="mt-4">
          <KnowledgeCheck
            checks={lesson.knowledgeChecks}
            onSeekScene={handleSeekScene}
          />
        </div>
      )}
    </div>
  );
}
