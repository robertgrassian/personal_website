"use client";

import { useEffect } from "react";
import type { Game } from "@/lib/games";
import { GameStats } from "./GameStats";
import { CloseIcon } from "@/components/Icon";

type StatsPanelProps = {
  games: Game[];
  isOpen: boolean;
  onClose: () => void;
};

export function StatsPanel({ games, isOpen, onClose }: StatsPanelProps) {
  // Lock body scroll and listen for Escape while the panel is open.
  // Restores the previous overflow value on cleanup rather than blindly
  // resetting to "" — safe if another scroll lock is active concurrently.
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop — clicking it closes the panel */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Slide-over panel — translates off-screen when closed */}
      <aside
        aria-label="Library stats"
        aria-modal="true"
        role="dialog"
        className={`fixed top-0 right-0 z-40 h-full w-full sm:w-[420px] flex flex-col bg-background border-l border-divider shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-divider shrink-0">
          <div>
            <h2 className="text-base font-bold text-emphasis">Library Stats</h2>
            <p className="text-xs text-muted mt-0.5">{games.length} games total</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close stats panel"
            className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-divider transition-colors"
          >
            <CloseIcon className="w-5 h-5 cursor-pointer" aria-hidden />
          </button>
        </div>

        {/* Scrollable stats content */}
        <div className="overflow-y-auto flex-1 px-6 py-6">
          <GameStats games={games} />
        </div>
      </aside>
    </>
  );
}
