"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Game } from "@/lib/games";
import type { WishlistGame } from "@/lib/wishlist";
import { ShelfSection } from "./ShelfSection";
import { FilterBar } from "./FilterBar";
import type { GameView } from "./libraryConfig";
import {
  filterGames,
  groupGames,
  sortGames,
  filterWishlist,
  groupWishlist,
  sortWishlist,
} from "./pipeline";
import { useFilterOptions } from "./useFilterOptions";
import { useKeepResultsInView } from "./useKeepResultsInView";
import type { UrlState } from "./useGameLibraryUrlState";
import { accentButtonClass } from "./formStyles";
import { systemLabel } from "@/lib/games";

// Loaded on demand rather than in the page bundle. The panel pulls in GameStats
// (five aggregation passes) and SqlQueryPanel, neither of which most visitors
// ever open. `ssr: false` because there is nothing useful to prerender: the
// panel is closed on first paint by definition. (alasql, the heavy dependency,
// is already deferred separately inside SqlQueryPanel.)
const StatsPanel = dynamic(() => import("./StatsPanel").then((m) => m.StatsPanel), {
  ssr: false,
});

type GameShelvesProps = {
  games: Game[];
  wishlist: WishlistGame[];
  // In-progress games, a subset of `games`; forwarded to the stats panel so
  // "Recently Played" can rank them first.
  currentlyPlayingGames: Game[];
  // The same value as `urlState.view`, narrowed to GameView: this component
  // only mounts on a shelf tab, which is the whole point of the split, and the
  // filter/group/sort machinery no longer has to opt out of itself on a tab
  // that lists usernames. Passed separately rather than read off urlState
  // because only the caller's `isGameView` check can do the narrowing. Read
  // this one, never `urlState.view`, so the two cannot be seen to disagree.
  view: GameView;
  // Still needed here for the copy ("Your library" vs "This library") and the
  // empty-library call to action. Whether a *card* shows a pencil is no longer
  // this component's business: GameCase reads that from LibraryEditingContext.
  canEdit: boolean;
  urlState: UrlState;
  onAddGame: () => void;
  // Owned by GameLibrary because the button that opens it lives in the tab
  // strip up there, while the panel it opens belongs down here.
  statsOpen: boolean;
  onStatsClose: () => void;
};

// The shelf half of the library: filter chrome, the filter/group/sort pipeline,
// the shelves themselves, and the stats panel. Split out of GameLibrary, which
// kept the tab strip, the view routing and the modals.
export function GameShelves({
  games,
  wishlist,
  currentlyPlayingGames,
  view,
  canEdit,
  urlState,
  onAddGame,
  statsOpen,
  onStatsClose,
}: GameShelvesProps) {
  const {
    groupBy,
    sortOrder,
    activeFilters,
    activeWishlistFilters,
    validGroupBy,
    validSortOrder,
    setGroupBy,
    setSortOrder,
    setSharedFilter,
    setRating,
    clearFilters,
  } = urlState;

  // The panel used to mount for every visitor and merely slide out of view on
  // a CSS transform, so its aggregation passes ran and its DOM was hydrated for
  // everyone. Two pieces of state rather than one:
  //
  //   statsMounted   latched true on first open and never back, so closing the
  //                  panel keeps whatever you typed into the SQL tab
  //   statsVisible   the isOpen the panel actually sees, flipped one frame
  //                  after mount so the slide-in has a start state to animate
  //                  from instead of appearing already open
  //
  // The frame trick is best-effort: on the very first open the dynamic import
  // may resolve after the animation frame has passed, in which case the panel
  // mounts open and the slide-in is skipped that once. Every later open
  // animates normally.
  const [statsMounted, setStatsMounted] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);
  useEffect(() => {
    if (!statsOpen) {
      setStatsVisible(false);
      return;
    }
    setStatsMounted(true);
    const frame = requestAnimationFrame(() => setStatsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [statsOpen]);

  // "There is genuinely nothing in this view", as opposed to "the filters
  // excluded everything".
  const isNothingHere = view === "played" ? games.length === 0 : wishlist.length === 0;

  // Typing must not wait on the shelves.
  //
  // The search box is a controlled input reading `activeFilters.search`, and
  // everything below runs off that same value: filter, group and sort over the
  // whole library, the two "available filters" passes, then reconciling ~155
  // cases. React renders all of that in the same commit as the keystroke, so
  // the character could not appear until the pass had finished. On a big
  // library that reads as typing that catches, and it is why a fast typist
  // could out-run the box.
  //
  // useDeferredValue splits the priorities: the input re-renders immediately
  // with the new value, and React re-runs the expensive consumers afterward at
  // lower priority with the value trailing by a render. When there is no load
  // the two are the same object in the same commit and nothing changes. The
  // filter bar keeps `activeFilters` so what you typed is always what you see.
  const deferredFilters = useDeferredValue(activeFilters);
  const deferredWishlistFilters = useDeferredValue(activeWishlistFilters);

  // Dropdown options plus the "would still yield results" subsets, for
  // whichever view is mounted. See useFilterOptions for why this is one call
  // rather than eight memos declared here.
  //
  // Deferred, not live: these drive which options render disabled, which is
  // decoration on the same pass the shelves use and must not hold up the
  // keystroke either.
  const { allSystems, allGenres, availableRatings, availableSystems, availableGenres } =
    useFilterOptions({
      games,
      wishlist,
      view,
      activeFilters: deferredFilters,
      activeWishlistFilters: deferredWishlistFilters,
    });

  // filter → group → sort, branched by view so each pipeline runs against
  // data of its own type (Game[] vs WishlistGame[]).
  const activeShelves = useMemo(() => {
    if (view === "played") {
      const filtered = filterGames(games, deferredFilters);
      const groups =
        groupBy === "none" ? [{ label: "", games: filtered }] : groupGames(filtered, groupBy);
      return groups
        .filter((g) => g.games.length > 0)
        .map((group) => ({ ...group, games: sortGames(group.games, sortOrder) }));
    }
    // No "none" short-circuit here (unlike played): groupWishlist always has
    // to run so the Starred shelf is split off even when grouping is off.
    const filtered = filterWishlist(wishlist, deferredWishlistFilters);
    return groupWishlist(filtered, groupBy)
      .filter((g) => g.games.length > 0)
      .map((group) => ({ ...group, games: sortWishlist(group.games, sortOrder) }));
  }, [view, games, wishlist, deferredFilters, deferredWishlistFilters, groupBy, sortOrder]);

  // Filtering collapses the document, the browser clamps the scroll position,
  // and the surviving shelves can land under the sticky chrome. These two refs
  // are what lets that be corrected: the bar knows how much room to clear, the
  // results are what has to clear it.
  const barRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Which shelves exist and how full each one is. Derived from `activeShelves`,
  // which runs off the DEFERRED filters, so it trails a keystroke by a render
  // rather than firing on each one. Re-sorting inside a shelf reorders
  // `activeShelves` without changing this string, which is the point: a sort is
  // not a new result set and must not move the page.
  const shelfSignature = activeShelves.map((s) => `${s.label}:${s.games.length}`).join("|");
  useKeepResultsInView(resultsRef, barRef, shelfSignature);

  // The eight props both views pass identically. Spread rather than repeated,
  // so a new shared prop cannot land on one view and not the other.
  //
  // `view` stays a literal at each call site on purpose: FilterBarProps is a
  // discriminated union on it, and that is what still narrows onRatingChange to
  // the played view only.
  const filterBarCommon = {
    barRef,
    onSharedFilterChange: setSharedFilter,
    groupBy,
    sortOrder,
    validGroupBy,
    validSortOrder,
    onGroupByChange: setGroupBy,
    onSortOrderChange: setSortOrder,
    allSystems,
    allGenres,
    availableSystems,
    availableGenres,
  };

  const activeTotal = view === "played" ? games.length : wishlist.length;
  const filteredCount = activeShelves.reduce((sum, s) => sum + s.games.length, 0);

  // Shared keys check once; rating is played-only.
  const hasActiveFilters =
    activeFilters.search !== "" ||
    activeFilters.system !== "" ||
    activeFilters.genre !== "" ||
    (view === "played" && activeFilters.rating !== "");

  return (
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
          {...filterBarCommon}
          view="played"
          filters={activeFilters}
          onRatingChange={setRating}
          availableRatings={availableRatings}
        />
      ) : (
        <FilterBar {...filterBarCommon} view="wishlist" filters={activeWishlistFilters} />
      )}

      {/* pb-24 keeps the last shelf clear of the viewport bottom.

          There is one shelf group here, not two. A separate owner-only
          "Unrated" shelf used to hang below this block, outside the
          filter/group/sort pipeline; it was removed because unrated games are
          now ordinary library members, shown to everyone and reached through
          the same pipeline as everything else. They mix into their normal
          shelves under groupBy system/genre/decade/none, collect under
          "Unrated" (pinned last) under groupBy=rating, and answer to search and
          to every filter — which the separate shelf never did. */}
      <div ref={resultsRef} className="pb-24">
        {activeShelves.length === 0 ? (
          // Three situations, three needs: a brand-new owner needs a way in, a
          // visitor to an empty library needs to know it's empty rather than
          // broken, and a filtered-to-nothing shelf needs neither.
          isNothingHere ? (
            <div className="mt-24 flex flex-col items-center gap-4 text-center">
              {/* Two words vary across the four cases, so they are the only
                  thing branched on — spelling out four near-identical
                  sentences instead lets them drift apart one edit at a
                  time. */}
              <p className="text-lg text-shelf-text-muted">
                {`${canEdit ? "Your" : "This"} ${
                  view === "played" ? "library" : "wishlist"
                } is empty.`}
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={onAddGame}
                  // Site amber accent + text-background, the same pairing the
                  // login button and the sign-up CTA use, so it reads correctly
                  // in light and dark.
                  className={`${accentButtonClass} text-sm`}
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
                label={groupBy === "system" ? systemLabel(shelf.label) : shelf.label}
                games={shelf.games}
              />
            ))}
          </div>
        )}
      </div>

      {view === "played" && statsMounted && (
        <StatsPanel
          games={games}
          currentlyPlayingGames={currentlyPlayingGames}
          isOpen={statsVisible}
          onClose={onStatsClose}
        />
      )}
    </>
  );
}
