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
  // Lock body scroll while the panel is open so the page doesn't scroll behind it.
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Close on Escape key press.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
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
            <CloseIcon className="w-5 h-5" aria-hidden />
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
