"use client";

import { useState, useMemo } from "react";
import type { Game } from "@/lib/games";
import type { WishlistGame } from "@/lib/wishlist";
import { ShelfSection } from "./ShelfSection";
import { FilterBar } from "./FilterBar";
import { StatsPanel } from "./StatsPanel";
import { ChartBarIcon } from "@/components/Icon";
import { VIEW_LABEL, VALID_GAME_VIEW, isGameView } from "./libraryConfig";
import { PeopleList } from "./PeopleList";
import type { UserSummary } from "@/lib/follows";
import {
  filterGames,
  groupGames,
  sortGames,
  filterWishlist,
  groupWishlist,
  sortWishlist,
} from "./pipeline";
import { useGameLibraryUrlState } from "./useGameLibraryUrlState";
import { useIsOwner } from "./FollowControls";
import { EditGameModal } from "./EditGameModal";
import { EditWishlistModal } from "./EditWishlistModal";
import { AddGameModal } from "./AddGameModal";
import type { GameCaseInput } from "./GameCase";

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

  // The game being edited, tracked by id (not object) so the open dialog
  // always reflects the latest server data after a revalidation replaces the
  // games array. Searching rated AND unrated keeps the dialog open (and
  // consistent) when a rating change moves the game between those shelves.
  const [editingGameId, setEditingGameId] = useState<number | null>(null);
  const editingGame =
    games.find((g) => g.id === editingGameId) ?? unratedGames.find((g) => g.id === editingGameId);
  // Wishlist edits tracked separately — the pencil is shared, but the two
  // views open different dialogs (EditGameModal vs EditWishlistModal).
  const [editingWishlistId, setEditingWishlistId] = useState<number | null>(null);
  const editingWishlistItem = wishlist.find((w) => w.id === editingWishlistId);
  const handleEditGame = (game: GameCaseInput) => {
    if (view === "wishlist") setEditingWishlistId(game.id ?? null);
    else setEditingGameId(game.id ?? null);
  };

  // URL-backed state lives in the hook; this component only renders.
  const {
    view,
    groupBy,
    sortOrder,
    activeFilters,
    activeWishlistFilters,
    validGroupBy,
    validSortOrder,
    setView,
    setGroupBy,
    setSortOrder,
    setSharedFilter,
    setRating,
    clearFilters,
  } = useGameLibraryUrlState();

  // "There is genuinely nothing in this view", as opposed to "the filters
  // excluded everything". Rated and unrated are both checked because an owner
  // whose only games are unrated still has a library — they'd see it on the
  // Unrated shelf, so telling them it's empty would be wrong.
  const isNothingHere =
    view === "played" ? games.length === 0 && unratedGames.length === 0 : wishlist.length === 0;

  // Option lists for each view's dropdowns — memoized on the immutable props.
  const allSystems = useMemo(() => [...new Set(games.map((g) => g.system))].sort(), [games]);
  const allGenres = useMemo(() => [...new Set(games.flatMap((g) => g.genres))].sort(), [games]);
  const allSystemsWishlist = useMemo(
    () => [...new Set(wishlist.map((w) => w.system))].sort(),
    [wishlist]
  );
  const allGenresWishlist = useMemo(
    () => [...new Set(wishlist.flatMap((w) => w.genres))].sort(),
    [wishlist]
  );
  // Shelf-system suggestions for the add/promote forms. Deliberately distinct
  // from `allSystems`: the filter dropdown should only offer systems you can
  // actually filter to (rated games), but a system that currently exists only
  // on an unrated game is still one of your shelves, so it belongs here.
  const systemSuggestions = useMemo(
    () => [...new Set([...games, ...unratedGames].map((g) => g.system))].sort(),
    [games, unratedGames]
  );

  // "Available" sets — values that still yield results given the other active
  // filters. Options outside these sets render as disabled in the dropdowns.
  const availableRatings = useMemo(
    () =>
      new Set(
        filterGames(games, { ...activeFilters, rating: "" })
          .map((g) => g.rating)
          .filter((r) => r !== "")
      ),
    [games, activeFilters]
  );
  const availableSystems = useMemo(
    () => new Set(filterGames(games, { ...activeFilters, system: "" }).map((g) => g.system)),
    [games, activeFilters]
  );
  const availableGenres = useMemo(
    () => new Set(filterGames(games, { ...activeFilters, genre: "" }).flatMap((g) => g.genres)),
    [games, activeFilters]
  );
  const availableSystemsWishlist = useMemo(
    () =>
      new Set(
        filterWishlist(wishlist, { ...activeWishlistFilters, system: "" }).map((w) => w.system)
      ),
    [wishlist, activeWishlistFilters]
  );
  const availableGenresWishlist = useMemo(
    () =>
      new Set(
        filterWishlist(wishlist, { ...activeWishlistFilters, genre: "" }).flatMap((w) => w.genres)
      ),
    [wishlist, activeWishlistFilters]
  );

  // filter → group → sort, branched by view so each pipeline runs against
  // data of its own type (Game[] vs WishlistGame[]).
  const activeShelves = useMemo(() => {
    // People tabs render no shelves at all; bail before the game pipelines so
    // they don't run against data nothing is going to display.
    if (!isGameView(view)) return [];
    if (view === "played") {
      const filtered = filterGames(games, activeFilters);
      const groups =
        groupBy === "none" ? [{ label: "", games: filtered }] : groupGames(filtered, groupBy);
      return groups
        .filter((g) => g.games.length > 0)
        .map((group) => ({ ...group, games: sortGames(group.games, sortOrder) }));
    }
    // No "none" short-circuit here (unlike played): groupWishlist always has
    // to run so the Starred shelf is split off even when grouping is off.
    const filtered = filterWishlist(wishlist, activeWishlistFilters);
    return groupWishlist(filtered, groupBy)
      .filter((g) => g.games.length > 0)
      .map((group) => ({ ...group, games: sortWishlist(group.games, sortOrder) }));
  }, [view, games, wishlist, activeFilters, activeWishlistFilters, groupBy, sortOrder]);

  const activeTotal = view === "played" ? games.length : wishlist.length;
  const filteredCount = activeShelves.reduce((sum, s) => sum + s.games.length, 0);

  // Shared keys check once; rating is played-only.
  const hasActiveFilters =
    activeFilters.search !== "" ||
    activeFilters.system !== "" ||
    activeFilters.genre !== "" ||
    (view === "played" && activeFilters.rating !== "");

  return (
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
              onClick={() => setAddOpen(true)}
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
          filter chrome, people tabs render a list of users. Everything below
          this point in the game branch is unchanged from before the people
          tabs existed — which is the reason for the GameView/PeopleView split,
          since several of those blocks treat "not played" as "wishlist". */}
      {!isGameView(view) ? (
        <PeopleList
          view={view}
          users={view === "following" ? following : followers}
          isOwner={canEdit}
        />
      ) : (
        <>
          {/* Filter status — rendered only while filters are active, so the row
          contributes no height (whitespace) the rest of the time. */}
          {hasActiveFilters && (
            <div className="flex items-center gap-3 mb-3">
              <span className="text-shelf-text-muted text-sm">
                {filteredCount} of {activeTotal} games
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="text-shelf-text-muted text-sm underline underline-offset-2 cursor-pointer hover:text-shelf-text transition-colors"
              >
                Clear filters
              </button>
            </div>
          )}

          {view === "played" ? (
            <FilterBar
              view="played"
              filters={activeFilters}
              onSharedFilterChange={setSharedFilter}
              onRatingChange={setRating}
              groupBy={groupBy}
              sortOrder={sortOrder}
              validGroupBy={validGroupBy}
              validSortOrder={validSortOrder}
              allSystems={allSystems}
              allGenres={allGenres}
              availableRatings={availableRatings}
              availableSystems={availableSystems}
              availableGenres={availableGenres}
              onGroupByChange={setGroupBy}
              onSortOrderChange={setSortOrder}
            />
          ) : (
            <FilterBar
              view="wishlist"
              filters={activeWishlistFilters}
              onSharedFilterChange={setSharedFilter}
              groupBy={groupBy}
              sortOrder={sortOrder}
              validGroupBy={validGroupBy}
              validSortOrder={validSortOrder}
              allSystems={allSystemsWishlist}
              allGenres={allGenresWishlist}
              availableSystems={availableSystemsWishlist}
              availableGenres={availableGenresWishlist}
              onGroupByChange={setGroupBy}
              onSortOrderChange={setSortOrder}
            />
          )}

          {/* One padded container around BOTH shelf groups. The pb-24 keeps the
              last shelf clear of the viewport bottom, so it has to sit on
              whichever group is genuinely last — when it lived on the grouped
              block alone, its 6rem landed *between* that block and the Unrated
              shelf below it, reading as a gap rather than as trailing space. */}
          <div className="pb-24">
            {activeShelves.length === 0 ? (
              // Three different situations used to share one message. They call for
              // different things: a brand-new owner needs a way in, a visitor to an
              // empty library needs to know it's empty rather than broken, and a
              // filtered-to-nothing shelf needs neither.
              isNothingHere ? (
                <div className="mt-24 flex flex-col items-center gap-4 text-center">
                  <p className="text-lg text-shelf-text-muted">
                    {canEdit
                      ? view === "played"
                        ? "Your library is empty."
                        : "Your wishlist is empty."
                      : view === "played"
                        ? "This library is empty."
                        : "This wishlist is empty."}
                  </p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setAddOpen(true)}
                      // Site amber accent + text-background, the same pairing the
                      // login button and the sign-up CTA use, so it reads correctly
                      // in light and dark.
                      className="rounded-md bg-link px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 cursor-pointer"
                    >
                      {view === "played" ? "Add your first game" : "Add your first wish"}
                    </button>
                  )}
                </div>
              ) : (
                <p className="mt-24 text-center text-shelf-text-muted text-lg italic">
                  No games match your filters.
                </p>
              )
            ) : (
              // ShelfSection brings its own mt-10, so this only needs to offset
              // the group from the filter bar above it.
              <div className="mt-6">
                {activeShelves.map((shelf) => (
                  <ShelfSection
                    key={shelf.label}
                    label={shelf.label}
                    games={shelf.games}
                    onEditGame={canEdit ? handleEditGame : undefined}
                  />
                ))}
              </div>
            )}

            {/* Owner-only "Unrated" shelf: every unrated game keeps a case (and a
                pencil), so clearing a rating is always reversible from the UI.
                Deliberately outside the filter/group/sort pipeline — it's a small
                owner utility surface, not part of the public browsing experience. */}
            {view === "played" && canEdit && unratedGames.length > 0 && (
              <ShelfSection label="Unrated" games={unratedGames} onEditGame={handleEditGame} />
            )}
          </div>

          {view === "played" && (
            <StatsPanel
              games={games}
              currentlyPlayingGames={currentlyPlayingGames}
              isOpen={statsOpen}
              onClose={() => setStatsOpen(false)}
            />
          )}
        </>
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
  );
}
