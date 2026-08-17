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
import { ownedKey } from "./GameSearchStep";
import type { GameCaseInput } from "./GameCase";
import { LibraryEditingProvider } from "./LibraryEditingContext";

type GameLibraryProps = {
  // Every played game, rated and unrated alike — one list through one pipeline.
  games: Game[];
  wishlist: WishlistGame[];
  // In-progress games, a subset of `games`; forwarded to the stats panel so
  // "Recently Played" can rank them first.
  currentlyPlayingGames: Game[];
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

  // Bail on the id before scanning. These ran an array scan each on every
  // render, including every keystroke in the search box, to look up a dialog
  // that is closed almost all of the time.
  //
  // Looking up by id rather than by position keeps the dialog open and
  // consistent when a rating change moves the game to a different shelf.
  const editingGame = useMemo(
    () => (editingGameId === null ? undefined : games.find((g) => g.id === editingGameId)),
    [editingGameId, games]
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
      if (view === "wishlist") setEditingWishlistId(game.id);
      else setEditingGameId(game.id);
    },
    [view]
  );
  // null for a visitor — GameCase gates the pencil on exactly this.
  const openEditor = canEdit ? handleEditGame : null;
  const handleAddGame = useCallback(() => setAddOpen(true), []);
  const handleStatsOpen = useCallback(() => setStatsOpen(true), []);
  const handleStatsClose = useCallback(() => setStatsOpen(false), []);

  // Shelf systems, offered as suggestions in the add and promote forms.
  //
  // This is the same list the filter bar's system dropdown shows, and used not
  // to be: the dropdown could only offer systems you could filter to, which
  // excluded any system that existed solely on an unrated game. Now that
  // unrated games are ordinary library members, both lists are just "every
  // system in `games`". Computed here rather than read off useFilterOptions
  // because that hook lives with the shelves and these feed the modals; it is
  // one pass over a prop that only changes when the server data does.
  const existingSystems = useMemo(() => [...new Set(games.map((g) => g.system))].sort(), [games]);

  // What the add-game search already has, so a result can say so instead of
  // silently letting you add a second copy. Valued with the systems it is on,
  // which is what makes this an annotation rather than a policy: it reports
  // what you own and leaves the decision alone.
  //
  // The value is a list for history: uq_played_games_user_id_metadata_id makes
  // a second row for the same game impossible, so only two hand-entered rows
  // whose names fold equal ("Pokemon" / "Pokémon") still fill it. Kept because
  // relaxing that key to include `system` is a live option (api/README.md).
  //
  // Keyed by `ownedKey`, which mirrors the server's identity rule: igdbId when
  // there is one, folded name only for hand-entered games. Keying on the name
  // alone used to flag every "Star Fox" in the results as owned when only one
  // of them was.
  //
  // Scoped to the collection being added to: adding to the wishlist checks the
  // wishlist, adding to the library checks the library. Both the map and the
  // dialog derive from this one value rather than each testing `view`
  // themselves — written as two separate predicates they disagreed on the
  // people views (`?view=followers` reached the dialog with the wishlist as its
  // target but the library as its map), which is reachable because `addOpen`
  // survives a view change.
  const addTarget = view === "played" ? "library" : "wishlist";
  const ownedNames = useMemo(() => {
    const source: Array<{ name: string; system: string; igdbId: number | null }> =
      addTarget === "wishlist" ? wishlist : games;
    const byGame = new Map<string, string[]>();
    for (const entry of source) {
      const key = ownedKey(entry);
      const systems = byGame.get(key);
      if (systems === undefined) {
        byGame.set(key, entry.system ? [entry.system] : []);
      } else if (entry.system && !systems.includes(entry.system)) {
        systems.push(entry.system);
      }
    }
    return byGame;
  }, [addTarget, games, wishlist]);

  // Built here but rendered by whichever branch below owns the layout, because
  // on a shelf view it belongs INSIDE GameShelves' sticky header (see the `tabs`
  // prop there) and on a people view there is no sticky header to join. Held as
  // a variable rather than duplicated so the two branches cannot drift.
  //
  // Carrying JSX in a variable is ordinary React: elements are values, so this
  // is no different from any other expression assigned before the return.
  //
  // No vertical margin of its own — the branch that renders it decides the
  // spacing, since the sticky block wants none and the people list wants some.
  const tabs = (
    // View tab strip — underline pattern shared with StatsPanel.
    // justify-between puts the Stats button on the same baseline row as the
    // tabs (played-only), keeping the strip a single compact line.
    // Stays one row at every width, down to 320px. Every label is
    // whitespace-nowrap and the strip does not wrap, so the way it makes room
    // on a narrow phone is smaller type (text-xs under 375px) and tighter
    // spacing under sm, never a second row: the row costs ~36px of a screen
    // that the shelves want more than the chrome does.
    <div className="flex items-center justify-between border-b border-shelf-plank">
      <div className="flex">
        {VALID_GAME_VIEW.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            // Measured: text-sm with this spacing needs 375px to fit the two
            // tabs plus both buttons on one row, so text-xs takes over below
            // that. Desktop keeps the original mr-4 and text-sm.
            className={`py-2.5 mr-2 sm:mr-4 whitespace-nowrap text-xs min-[375px]:text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
              view === v
                ? "border-link text-link"
                : "border-transparent text-shelf-text-muted hover:text-link hover:border-shelf-plank"
            }`}
          >
            {VIEW_LABEL[v]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-0 sm:gap-1">
        {canEdit && isGameView(view) && (
          <button
            type="button"
            onClick={handleAddGame}
            className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 rounded-md text-shelf-text-muted text-xs min-[375px]:text-sm whitespace-nowrap hover:text-link hover:bg-shelf-input transition-colors cursor-pointer"
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
            onClick={handleStatsOpen}
            aria-label="Open library stats"
            className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 rounded-md text-shelf-text-muted text-xs min-[375px]:text-sm whitespace-nowrap hover:text-link hover:bg-shelf-input transition-colors cursor-pointer"
          >
            <ChartBarIcon className="w-4 h-4 shrink-0" aria-hidden />
            <span>Stats</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    // Wraps the whole body, not just the shelves, so every card surface reads
    // one answer however the views are rearranged later.
    <LibraryEditingProvider openEditor={openEditor}>
      {/* Half the gap on phones: this sits between the CRT and the sticky
          chrome, both of which already carry their own breathing room. */}
      <div className="mt-4 sm:mt-8">
        {/* One branch for the whole body: game tabs render the shelves and their
          filter chrome, people tabs render a list of users. The tab strip goes
          down into GameShelves on the first branch so it can be part of the
          sticky header, and is rendered here on the second. */}
        {isGameView(view) ? (
          <GameShelves
            games={games}
            wishlist={wishlist}
            currentlyPlayingGames={currentlyPlayingGames}
            view={view}
            tabs={tabs}
            canEdit={canEdit}
            urlState={urlState}
            onAddGame={handleAddGame}
            statsOpen={statsOpen}
            onStatsClose={handleStatsClose}
          />
        ) : (
          <>
            {/* The people lists are short and their headings sit right under
                the strip, so nothing here is worth sticking. */}
            <div className="mb-4">{tabs}</div>
            <PeopleList
              view={view}
              users={view === "following" ? following : followers}
              isOwner={canEdit}
            />
          </>
        )}

        {editingGame && (
          <EditGameModal
            game={editingGame}
            existingSystems={existingSystems}
            onClose={() => setEditingGameId(null)}
          />
        )}
        {editingWishlistItem && (
          <EditWishlistModal
            item={editingWishlistItem}
            existingSystems={existingSystems}
            onClose={() => setEditingWishlistId(null)}
          />
        )}
        {addOpen && (
          <AddGameModal
            target={addTarget}
            existingSystems={existingSystems}
            ownedNames={ownedNames}
            onClose={() => setAddOpen(false)}
          />
        )}
      </div>
    </LibraryEditingProvider>
  );
}
