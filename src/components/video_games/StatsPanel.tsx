"use client";

import { useState, useEffect, useRef } from "react";
import type { Game } from "@/lib/games";
import { GameStats } from "./GameStats";
import { SqlQueryPanel } from "./SqlQueryPanel";
import { ArrowLeftIcon, CloseIcon } from "@/components/Icon";
import { useModalChrome } from "./useModalChrome";
import { ModalBackdrop } from "./ModalBackdrop";
import { PlayHistoryList } from "./PlayHistoryList";
import type { PlayHistoryState } from "./usePlayHistory";

type StatsPanelProps = {
  games: Game[];
  // In-progress games, forwarded to GameStats for the "Recently Played" list.
  currentlyPlayingGames: Game[];
  isOpen: boolean;
  onClose: () => void;
  // The library's sessions, owned by GameLibrary. See usePlayHistory.
  playHistory: PlayHistoryState;
  // Called the first time the history view is opened, which is what triggers
  // the fetch. Separate from the view state below because the request must
  // outlive a back-press: going back and forward again must not refetch.
  onRequestHistory: () => void;
};

type PanelTab = "overview" | "query";

// The history REPLACES the panel's tabs rather than becoming a third one: it is
// a drill-down from a specific list inside Overview, and a tab would suggest it
// sits alongside them. Same shell either way, so the panel keeps its size,
// scroll lock and focus handling.
type PanelView = "stats" | "history";

export function StatsPanel({
  games,
  currentlyPlayingGames,
  isOpen,
  onClose,
  playHistory,
  onRequestHistory,
}: StatsPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("overview");
  const [view, setView] = useState<PanelView>("stats");

  const openHistory = () => {
    onRequestHistory();
    setView("history");
  };

  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Reset to the default tab AND view when the panel closes, so re-opening
  // always starts on Overview rather than wherever the last visit ended.
  useEffect(() => {
    if (!isOpen) {
      setActiveTab("overview");
      setView("stats");
    }
  }, [isOpen]);

  // Scroll lock, Escape-to-close, and focus handling (into the panel on open,
  // back to the opener on close), shared with the three owner dialogs. This
  // panel stays mounted while closed — it slides in via a transform rather than
  // mounting — so it passes isOpen as `enabled` where those pass nothing.
  useModalChrome(onClose, closeButtonRef, isOpen);

  return (
    <>
      {/* Backdrop — clicking it closes the panel */}
      <ModalBackdrop
        onClose={onClose}
        className={`z-30 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Slide-over panel */}
      <aside
        aria-label={view === "history" ? "Play history" : "Library stats"}
        aria-modal="true"
        aria-hidden={!isOpen}
        inert={!isOpen}
        role="dialog"
        className={`fixed top-[var(--nav-offset)] right-0 z-40 h-[calc(100%-var(--nav-offset))] flex flex-col pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)] bg-background border-l border-divider shadow-2xl transition-[transform,width] duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        } ${
          // The wide width belongs to the query tab alone, so the history view
          // keeps the panel's normal size whatever tab it was opened over.
          view === "stats" && activeTab === "query"
            ? "w-full sm:w-[min(90vw,1000px)]"
            : "w-full sm:w-[560px]"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-divider shrink-0">
          <div className="flex min-w-0 items-center gap-2">
            {view === "history" && (
              // -ml-2 eats into the header padding so the bigger touch target
              // does not shift the title off the panel's left edge.
              <button
                type="button"
                onClick={() => setView("stats")}
                aria-label="Back to library stats"
                className="-ml-2 shrink-0 rounded-md p-1.5 text-muted hover:bg-divider hover:text-foreground transition-colors cursor-pointer"
              >
                <ArrowLeftIcon className="w-5 h-5" aria-hidden />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold text-emphasis">
                {view === "history" ? "Play History" : "Library Stats"}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {view === "history"
                  ? playHistory.sessions.length === 1
                    ? "1 session"
                    : `${playHistory.sessions.length} sessions`
                  : `${games.length} games total`}
              </p>
            </div>
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

        {/* Tab strip. Hidden in the history view, which is a drill-down out of
            Overview rather than a peer of these tabs. */}
        <div
          className={`flex border-b border-divider px-6 shrink-0 ${view === "history" ? "hidden" : ""}`}
        >
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
          {/* The stats views stay mounted under the history so the SQL panel's
              query and the scroll position survive a trip through it. */}
          <div className={view === "history" ? "" : "hidden"}>
            <PlayHistoryList
              sessions={playHistory.sessions}
              games={games}
              isLoading={playHistory.isLoading}
              error={playHistory.error}
              emptyMessage="No games have been played yet."
            />
          </div>
          <div className={view === "stats" && activeTab === "overview" ? "" : "hidden"}>
            <GameStats
              games={games}
              currentlyPlayingGames={currentlyPlayingGames}
              onSeeAllPlayed={openHistory}
            />
          </div>
          <div className={view === "stats" && activeTab === "query" ? "" : "hidden"}>
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
