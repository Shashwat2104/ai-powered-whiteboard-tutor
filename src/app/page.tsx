import { LessonApp } from "@/components/LessonApp";
import { Sparkles, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col justify-between overflow-x-hidden">
      {/* Top Navigation */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-slate-900 dark:text-slate-100">
                Whiteboard Tutor
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium">
                AI Interactive
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span className="hidden sm:inline">Multi-Provider LLM &amp; TTS Fallback</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-6xl mx-auto p-2 sm:p-4 lg:p-6">
        <LessonApp />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
        <p>AI-Powered Interactive Whiteboard Tutor &bull; Built with Next.js, Claude &amp; Gemini, ElevenLabs &amp; Google TTS</p>
      </footer>
    </div>
  );
}
