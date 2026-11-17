import { LessonApp } from "@/components/LessonApp";
import { PenTool, Keyboard } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col justify-between overflow-x-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-700 dark:bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <PenTool className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-base tracking-tight text-slate-900 dark:text-slate-100">
                Whiteboard Tutor
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 font-normal">
                Synchronized whiteboard drawings &amp; voice narration
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-400">
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60">
              <Keyboard className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" aria-hidden="true" />
              <span>Space: Play/Pause · ←/→: 10s · Home: Restart</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-6xl mx-auto p-3 sm:p-5 lg:p-6 flex flex-col justify-start">
        <LessonApp />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-5 text-xs text-slate-600 dark:text-slate-400">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <p>
            <strong className="font-semibold text-slate-700 dark:text-slate-300">Whiteboard Tutor</strong> — Step-by-step cognitive clarity through synchronized narration and real-time diagrams.
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400">
            Accessible whiteboard pedagogy · WCAG 2.2 AA compliant
          </p>
        </div>
      </footer>
    </div>
  );
}
