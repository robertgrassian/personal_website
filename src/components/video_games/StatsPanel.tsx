"use client";

import { useState, useEffect, useRef } from "react";
import type { Game } from "@/lib/games";
import { GameStats } from "./GameStats";
import { SqlQueryPanel } from "./SqlQueryPanel";
import { CloseIcon } from "@/components/Icon";

type StatsPanelProps = {
  games: Game[];
  isOpen: boolean;
  onClose: () => void;
};

type PanelTab = "overview" | "query";

export function StatsPanel({ games, isOpen, onClose }: StatsPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("overview");

  // "Latest ref" pattern: keeps onClose stable as a dep-free ref so the
  // scroll-lock effect doesn't re-run when the parent re-renders.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Lock body scroll and listen for Escape while the panel is open.
  // Restores the previous overflow value on cleanup rather than blindly
  // resetting to "" — safe if another scroll lock is active concurrently.
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    closeButtonRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]); // onClose intentionally omitted — accessed via ref above

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

      {/* Slide-over panel */}
      <aside
        aria-label="Library stats"
        aria-modal="true"
        aria-hidden={!isOpen}
        inert={!isOpen}
        role="dialog"
        className={`fixed top-[var(--nav-height)] right-0 z-40 h-[calc(100%-var(--nav-height))] w-full sm:w-[560px] flex flex-col bg-background border-l border-divider shadow-2xl transition-transform duration-300 ease-in-out ${
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
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close stats panel"
            className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-divider transition-colors"
          >
            <CloseIcon className="w-5 h-5 cursor-pointer" aria-hidden />
          </button>
        </div>

        {/* Tab strip */}
        <div className="flex border-b border-divider px-6 shrink-0">
          {(["overview", "query"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`py-2.5 mr-4 text-sm font-medium border-b-2 -mb-px capitalize transition-colors cursor-pointer ${
                activeTab === tab
                  ? "border-link text-link"
                  : "border-transparent text-muted hover:text-foreground hover:border-divider"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-6 py-6">
          {activeTab === "overview" && <GameStats games={games} />}
          {activeTab === "query" && <SqlQueryPanel games={games} />}
        </div>
      </aside>
    </>
  );
}
