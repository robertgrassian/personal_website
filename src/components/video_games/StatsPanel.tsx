"use client";

import { useState, useEffect, useRef } from "react";
import type { Game } from "@/lib/games";
import { GameStats } from "./GameStats";
import { SqlQueryPanel } from "./SqlQueryPanel";
import { CloseIcon } from "@/components/Icon";
import { modalBackdropClass, useModalChrome } from "./useModalChrome";

type StatsPanelProps = {
  games: Game[];
  // In-progress games, forwarded to GameStats for the "Recently Played" list.
  currentlyPlayingGames: Game[];
  isOpen: boolean;
  onClose: () => void;
};

type PanelTab = "overview" | "query";

export function StatsPanel({ games, currentlyPlayingGames, isOpen, onClose }: StatsPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("overview");

  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Reset to the default tab when the panel closes so re-opening always starts on Overview.
  useEffect(() => {
    if (!isOpen) setActiveTab("overview");
  }, [isOpen]);

  // Scroll lock, Escape-to-close, and focus handling (into the panel on open,
  // back to the opener on close), shared with the three owner dialogs. This
  // panel stays mounted while closed — it slides in via a transform rather than
  // mounting — so it passes isOpen as `enabled` where those pass nothing.
  useModalChrome(onClose, closeButtonRef, isOpen);

  return (
    <>
      {/* Backdrop — clicking it closes the panel */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed z-30 ${modalBackdropClass} transition-opacity duration-300 ${
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
        className={`fixed top-[var(--nav-height)] right-0 z-40 h-[calc(100%-var(--nav-height))] flex flex-col bg-background border-l border-divider shadow-2xl transition-[transform,width] duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        } ${activeTab === "query" ? "w-full sm:w-[min(90vw,1000px)]" : "w-full sm:w-[560px]"}`}
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

        {/* Scrollable content — both panels stay mounted to preserve query state across tab switches */}
        <div className="overflow-y-auto flex-1 px-6 py-6">
          <div className={activeTab === "overview" ? "" : "hidden"}>
            <GameStats games={games} currentlyPlayingGames={currentlyPlayingGames} />
          </div>
          <div className={activeTab === "query" ? "" : "hidden"}>
            {/* `games` is the whole played library, so the SQL table no longer
                needs the currently-playing rows merged in — and it is now
                complete, where the old merge silently omitted any unrated game
                you weren't currently playing. GameStats above still takes the
                two lists separately, for dedup preference rather than ordering
                (see its prop comment). */}
            <SqlQueryPanel games={games} />
          </div>
        </div>
      </aside>
    </>
  );
}
