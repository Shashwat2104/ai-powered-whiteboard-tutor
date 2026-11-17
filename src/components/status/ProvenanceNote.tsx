import { Info } from "lucide-react";

export type VoiceSource = "elevenlabs" | "google" | "none";

interface ProvenanceNoteProps {
  /** The model id that wrote the lesson (from `lesson.generatedBy.model`). */
  model: string | undefined;
  /** Which voice narrated it; "none" means the board runs on estimated timing. */
  voice: VoiceSource | undefined;
}

const VOICE_LABEL: Record<VoiceSource, string> = {
  elevenlabs: "Voice: ElevenLabs",
  google: "Voice: Google Cloud TTS",
  none: "No narration audio; timing estimated from word count",
};

/** Tells the learner (and reviewers) exactly what is live AI output and what is not. */
export function ProvenanceNote({ model, voice }: ProvenanceNoteProps) {
  if (!model || !voice) return null;
  const simulated = model.startsWith("fake-");
  return (
    <p
      className="flex items-center justify-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-medium py-1"
      data-testid="provenance"
    >
      <Info className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
      <span>
        {simulated ? "Simulated test lesson (fixed sample, not live AI)" : `Written live by ${model}`} · {VOICE_LABEL[voice]}
      </span>
    </p>
  );
}
