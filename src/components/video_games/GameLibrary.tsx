"use client";

import { useState, useMemo, useCallback } from "react";
import type { Game } from "@/lib/games";
import type { WishlistGame } from "@/lib/wishlist";
import { GameShelves } from "./GameShelves";
import { ChartBarIcon } from "@/components/Icon";
import { VIEW_LABEL, VALID_GAME_VIEW, isGameView } from "./libraryConfig";
import { PeopleList } from "./PeopleList";
import type { UserSummary } from "@/lib/follows";
import { useGameLibraryUrlState } from "./useGameLibraryUrlState";
import { useIsOwner } from "./FollowControls";
import { EditGameModal } from "./EditGameModal";
import { EditWishlistModal } from "./EditWishlistModal";
import { AddGameModal } from "./AddGameModal";
import type { GameCaseInput } from "./GameCase";
import { LibraryEditingProvider } from "./LibraryEditingContext";

type GameLibraryProps = {
  games: Game[];
  wishlist: WishlistGame[];
  // In-progress games (may be unrated, so not in `games`); forwarded to the
  // stats panel so "Recently Played" can surface them.
  currentlyPlayingGames: Game[];
  // Games with no rating — rendered as an owner-only shelf so they stay
  // reachable (and re-ratable) after a rating is cleared.
  unratedGames: Game[];
  // The owner's follow graph, backing the Following/Followers tabs. Public
  // data fetched server-side, so it is cached with the page like the games.
  followers: UserSummary[];
  following: UserSummary[];
};

// The library shell: the view tab strip, routing between the shelf views and
// the people views, and the three owner modals. The shelf machinery itself
// lives in GameShelves — this component used to hold both, which meant the
// whole filter/group/sort pipeline was declared on a component that also
// renders a list of usernames.
export function GameLibrary({
  games,
  wishlist,
  currentlyPlayingGames,
  unratedGames,
  followers,
  following,
}: GameLibraryProps) {
  const [statsOpen, setStatsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Owner check resolves client-side after hydration (the page HTML is static
  // and shared by all viewers). false until proven otherwise, so visitors never
  // see a flash of edit controls.
  //
  // Read from the FollowStateProvider that LibraryPage wraps this in, which
  // means the same request that decides the Follow button also decides these
  // controls — they can no longer disagree mid-flight.
  const canEdit = useIsOwner();

  // URL-backed state lives in the hook; this component only renders. Passed
  // whole to GameShelves rather than unpacked into eleven props.
  const urlState = useGameLibraryUrlState();
  const { view, setView } = urlState;

  // The game being edited, tracked by id (not object) so the open dialog
  // always reflects the latest server data after a revalidation replaces the
  // games array.
  const [editingGameId, setEditingGameId] = useState<number | null>(null);
  // Wishlist edits tracked separately — the pencil is shared, but the two
  // views open different dialogs (EditGameModal vs EditWishlistModal).
  const [editingWishlistId, setEditingWishlistId] = useState<number | null>(null);

  // Bail on the id before scanning. These ran three array scans on every
  // render, including every keystroke in the search box, to look up a dialog
  // that is closed almost all of the time.
  //
  // Searching rated AND unrated keeps the dialog open (and consistent) when a
  // rating change moves the game between those shelves.
  const editingGame = useMemo(
    () =>
      editingGameId === null
        ? undefined
        : (games.find((g) => g.id === editingGameId) ??
          unratedGames.find((g) => g.id === editingGameId)),
    [editingGameId, games, unratedGames]
  );
  const editingWishlistItem = useMemo(
    () =>
      editingWishlistId === null ? undefined : wishlist.find((w) => w.id === editingWishlistId),
    [editingWishlistId, wishlist]
  );

  // useCallback so the context value below keeps a stable identity, which is
  // what lets the React.memo on GameCase actually bite.
  const handleEditGame = useCallback(
    (game: GameCaseInput) => {
      if (view === "wishlist") setEditingWishlistId(game.id ?? null);
      else setEditingGameId(game.id ?? null);
    },
    [view]
  );
  // null for a visitor — GameCase gates the pencil on exactly this.
  const openEditor = canEdit ? handleEditGame : null;
  const handleAddGame = useCallback(() => setAddOpen(true), []);
  const handleStatsClose = useCallback(() => setStatsOpen(false), []);

  // Shelf-system suggestions for the add/promote forms. Deliberately distinct
  // from the filter bar's `allSystems`: that dropdown should only offer systems
  // you can actually filter to (rated games), but a system that currently
  // exists only on an unrated game is still one of your shelves, so it belongs
  // here. Stays in this component because it feeds the modals, not the filters.
  const systemSuggestions = useMemo(
    () => [...new Set([...games, ...unratedGames].map((g) => g.system))].sort(),
    [games, unratedGames]
  );

  return (
    // Wraps the whole body, not just the shelves: the Unrated shelf, the
    // grouped shelves and any future card surface all read the same answer.
    <LibraryEditingProvider openEditor={openEditor}>
      <div className="mt-8">
        {/* View tab strip — underline pattern shared with StatsPanel.
          justify-between puts the Stats button on the same baseline row as the
          tabs (played-only), keeping the strip a single compact line. */}
        <div className="flex items-center justify-between border-b border-shelf-plank mb-4">
          <div className="flex">
            {VALID_GAME_VIEW.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`py-2.5 mr-4 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
                  view === v
                    ? "border-link text-link"
                    : "border-transparent text-shelf-text-muted hover:text-link hover:border-shelf-plank"
                }`}
              >
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {canEdit && isGameView(view) && (
              <button
                type="button"
                onClick={handleAddGame}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-shelf-text-muted text-sm hover:text-link hover:bg-shelf-input transition-colors cursor-pointer"
              >
                <span aria-hidden="true" className="text-base leading-none">
                  +
                </span>
                <span>{view === "played" ? "Add game" : "Add to wishlist"}</span>
              </button>
            )}
            {view === "played" && (
              <button
                type="button"
                onClick={() => setStatsOpen(true)}
                aria-label="Open library stats"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-shelf-text-muted text-sm hover:text-link hover:bg-shelf-input transition-colors cursor-pointer"
              >
                <ChartBarIcon className="w-4 h-4" aria-hidden />
                <span>Stats</span>
              </button>
            )}
          </div>
        </div>

        {/* One branch for the whole body: game tabs render the shelves and their
          filter chrome, people tabs render a list of users. */}
        {isGameView(view) ? (
          <GameShelves
            games={games}
            wishlist={wishlist}
            currentlyPlayingGames={currentlyPlayingGames}
            unratedGames={unratedGames}
            view={view}
            canEdit={canEdit}
            urlState={urlState}
            onAddGame={handleAddGame}
            statsOpen={statsOpen}
            onStatsClose={handleStatsClose}
          />
        ) : (
          <PeopleList
            view={view}
            users={view === "following" ? following : followers}
            isOwner={canEdit}
          />
        )}

        {editingGame && <EditGameModal game={editingGame} onClose={() => setEditingGameId(null)} />}
        {editingWishlistItem && (
          <EditWishlistModal
            item={editingWishlistItem}
            existingSystems={systemSuggestions}
            onClose={() => setEditingWishlistId(null)}
          />
        )}
        {addOpen && (
          <AddGameModal
            target={view === "played" ? "library" : "wishlist"}
            existingSystems={systemSuggestions}
            onClose={() => setAddOpen(false)}
          />
        )}
      </div>
    </LibraryEditingProvider>
  );
}
