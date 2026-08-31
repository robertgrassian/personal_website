"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { Game } from "@/lib/games";
import { GameStats } from "./GameStats";
import { SqlQueryPanel } from "./SqlQueryPanel";
import { ArrowLeftIcon, CloseIcon } from "@/components/Icon";
import { useModalChrome } from "./useModalChrome";
import { ModalBackdrop } from "./ModalBackdrop";
import { sessionsInLibrary } from "@/lib/sessions";
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
  // Triggers the fetch. Separate from the view state so a back-press does not
  // undo it and a second visit does not refetch.
  onRequestHistory: () => void;
};

type PanelTab = "overview" | "query";

// The history REPLACES the tabs rather than becoming a third one: it is a
// drill-down from one list inside Overview, not a peer of them. Same shell, so
// the panel keeps its size, scroll lock and focus handling.
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

  // The same set the list renders, not the raw array: this panel never
  // unmounts, so after a game is deleted its rows leave the list while the raw
  // length would go on counting them.
  const visibleSessions = useMemo(
    () => sessionsInLibrary(playHistory.sessions, new Set(games.map((game) => game.id))),
    [playHistory.sessions, games]
  );

  const openHistory = () => {
    onRequestHistory();
    setView("history");
  };

  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Re-opening starts on Overview rather than where the last visit ended.
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
          // The wide width is the query tab's alone, so the history keeps the
          // normal size whatever tab it was opened over.
          view === "stats" && activeTab === "query"
            ? "w-full sm:w-[min(90vw,1000px)]"
            : "w-full sm:w-[560px]"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-divider shrink-0">
          <div className="flex min-w-0 items-center gap-2">
            {view === "history" && (
              // -ml-2 eats into the header padding so the touch target does not
              // shift the title.
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
                  ? visibleSessions.length === 1
                    ? "1 session"
                    : `${visibleSessions.length} sessions`
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

        {/* Tab strip, hidden in the history view. */}
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
        {/* overscroll-contain because the scroll lock hands this region its
            own gestures: a flick past the end must stop here rather than
            chain to the page it is holding still. */}
        <div className="overflow-y-auto overscroll-contain flex-1 px-6 py-6">
          {/* Stats stay mounted so the SQL query survives a trip through the
              history. */}
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
