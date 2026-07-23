"use client";

import { useState, useMemo } from "react";
import type { Game } from "@/lib/games";
import type { WishlistGame } from "@/lib/wishlist";
import { ShelfSection } from "./ShelfSection";
import { FilterBar } from "./FilterBar";
import { StatsPanel } from "./StatsPanel";
import { ChartBarIcon } from "@/components/Icon";
import { VIEW_CONFIG, VALID_VIEW } from "./libraryConfig";
import {
  filterGames,
  groupGames,
  sortGames,
  filterWishlist,
  groupWishlist,
  sortWishlist,
} from "./pipeline";
import { useGameLibraryUrlState } from "./useGameLibraryUrlState";
import { useIsLibraryOwner } from "./useIsLibraryOwner";
import { EditGameModal } from "./EditGameModal";
import type { GameCaseInput } from "./GameCase";

type GameLibraryProps = {
  games: Game[];
  wishlist: WishlistGame[];
  // In-progress games (may be unrated, so not in `games`); forwarded to the
  // stats panel so "Recently Played" can surface them.
  currentlyPlayingGames: Game[];
};

export function GameLibrary({ games, wishlist, currentlyPlayingGames }: GameLibraryProps) {
  const [statsOpen, setStatsOpen] = useState(false);

  // Owner check resolves client-side after hydration (the page HTML is
  // static and shared by all viewers). false until proven otherwise, so
  // visitors never see a flash of edit controls.
  const canEdit = useIsLibraryOwner();

  // The game being edited, tracked by id (not object) so the open dialog
  // always reflects the latest server data after a revalidation replaces the
  // games array. Resolving to undefined — e.g. the game left the shelves
  // because its rating was cleared — closes the dialog via the null render.
  const [editingGameId, setEditingGameId] = useState<number | null>(null);
  const editingGame = games.find((g) => g.id === editingGameId);
  const handleEditGame = (game: GameCaseInput) => setEditingGameId(game.id ?? null);

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
    if (view === "played") {
      const filtered = filterGames(games, activeFilters);
      const groups =
        groupBy === "none" ? [{ label: "", games: filtered }] : groupGames(filtered, groupBy);
      return groups
        .filter((g) => g.games.length > 0)
        .map((group) => ({ ...group, games: sortGames(group.games, sortOrder) }));
    }
    const filtered = filterWishlist(wishlist, activeWishlistFilters);
    const groups =
      groupBy === "none" ? [{ label: "", games: filtered }] : groupWishlist(filtered, groupBy);
    return groups
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
          {VALID_VIEW.map((v) => (
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
              {VIEW_CONFIG[v].label}
            </button>
          ))}
        </div>
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

      {activeShelves.length === 0 ? (
        <p className="mt-24 text-center text-shelf-text-muted text-lg italic">
          {view === "wishlist" && wishlist.length === 0
            ? "Your wishlist is empty — add some games to wishlist.csv."
            : "No games match your filters."}
        </p>
      ) : (
        <div className="mt-6 pb-24">
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

      {view === "played" && (
        <StatsPanel
          games={games}
          currentlyPlayingGames={currentlyPlayingGames}
          isOpen={statsOpen}
          onClose={() => setStatsOpen(false)}
        />
      )}

      {editingGame && <EditGameModal game={editingGame} onClose={() => setEditingGameId(null)} />}
    </div>
  );
}
