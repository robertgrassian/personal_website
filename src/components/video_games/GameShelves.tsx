"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import type { Game } from "@/lib/games";
import type { WishlistGame } from "@/lib/wishlist";
import { ShelfSection } from "./ShelfSection";
import { FilterBar } from "./FilterBar";
import { FilterSheet } from "./FilterSheet";
import type { GameView } from "./libraryConfig";
import {
  filterGames,
  groupGames,
  sortGames,
  filterWishlist,
  groupWishlist,
  sortWishlist,
} from "./pipeline";
import type { PlayHistoryState } from "./usePlayHistory";
import { useFilterOptions } from "./useFilterOptions";
import { useKeepResultsInView } from "./useKeepResultsInView";
import { useHideOnScrollDown } from "./useHideOnScrollDown";
import type { UrlState } from "./useGameLibraryUrlState";
import { Button } from "@/components/ui/Button";
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
  // The view tab strip and its "+ Add game" / "Stats" buttons, built by
  // GameLibrary and rendered here as the first row of the sticky header.
  //
  // Passed as a node rather than moved into this component because the strip
  // switches between the shelf views and the people views, which is GameLibrary's
  // job, not this one's. Passing it down is what puts both halves of the chrome
  // in ONE sticky element — the alternative, two stacked sticky elements, needs
  // the strip's height to offset the filter bar's `top`, and that height changes
  // (the add button appears only for the owner, the tabs wrap on narrow screens).
  // A single container makes the height irrelevant.
  tabs: ReactNode;
  // Still needed here for the copy ("Your library" vs "This library"). Whether
  // a *card* shows a pencil is no longer this component's business: GameCase
  // reads that from LibraryCardContext.
  canEdit: boolean;
  // Confirmed ownership, which the empty-library call to action needs because
  // it opens the add dialog. See FollowControls for why adding is the one
  // affordance that cannot run on the cached guess.
  canAdd: boolean;
  urlState: UrlState;
  onAddGame: () => void;
  // Owned by GameLibrary because the button that opens it lives in the tab
  // strip up there, while the panel it opens belongs down here.
  statsOpen: boolean;
  onStatsClose: () => void;
  // Both forwarded straight to the stats panel, which is the only thing down
  // here that reads them. Owned by GameLibrary so one copy serves every
  // surface that shows sessions.
  playHistory: PlayHistoryState;
  onRequestHistory: () => void;
};

// The shelf half of the library: filter chrome, the filter/group/sort pipeline,
// the shelves themselves, and the stats panel. Split out of GameLibrary, which
// kept the tab strip, the view routing and the modals.
export function GameShelves({
  games,
  wishlist,
  currentlyPlayingGames,
  view,
  tabs,
  canEdit,
  canAdd,
  urlState,
  onAddGame,
  statsOpen,
  onStatsClose,
  playHistory,
  onRequestHistory,
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

  // The mobile filter sheet. Owned here rather than in FilterBar, which holds
  // the button that opens it: the bar lives inside the sticky header, and that
  // header's hide-on-scroll `translate` would become the containing block for
  // the sheet's `position: fixed`, positioning it against the header instead of
  // the viewport. Same reason StatsPanel is rendered here while its button
  // lives up in GameLibrary's tab strip.
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const openFilterSheet = useCallback(() => setFilterSheetOpen(true), []);
  const closeFilterSheet = useCallback(() => setFilterSheetOpen(false), []);

  // The sheet is hidden above `sm` by CSS, not by state, so crossing that
  // breakpoint while it is open leaves `filterSheetOpen` true with nothing on
  // screen and no reachable dismiss control (the opener is `sm:hidden` too).
  // Rotating a phone to landscape is enough to reach it. Consequences of the
  // leak: useModalChrome holds its body scroll lock, focus sits on a
  // display:none close button, and rotating back re-opens the sheet unasked.
  // Closing on the crossing is what keeps state and CSS agreeing about
  // whether this thing is open.
  //
  // 640px is Tailwind's `sm`, matching the variants on the sheet and the
  // opener, and the same query useHideOnScrollDown keys off.
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 640px)");
    const closeAboveSm = () => {
      if (mql.matches) setFilterSheetOpen(false);
    };
    mql.addEventListener("change", closeAboveSm);
    closeAboveSm(); // in case the first render was already desktop
    return () => mql.removeEventListener("change", closeAboveSm);
  }, []);

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
  // are what lets that be corrected: the header knows how much room to clear,
  // the results are what has to clear it.
  const headerRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Mobile only: the whole header slides away on scroll down and returns on
  // scroll up. Reading the ref that is actually sticky matters — the hook
  // snapshots that element's document position to decide where the behavior
  // starts.
  const headerVisible = useHideOnScrollDown(headerRef);

  // What the visitor narrowed the library BY, not what came back.
  //
  // Describing the output instead (shelf labels and counts) looks equivalent and
  // is not: an owner edit changes the counts too, so rating a game while scrolled
  // deep into the shelves would scroll the page out from under them — under
  // groupBy=rating the game even moves shelves. That is the yank this hook is
  // supposed to prevent, arriving from the one direction the output cannot
  // distinguish. The input says "the visitor asked for something different",
  // which is the only thing that should move the viewport.
  //
  // Built from the DEFERRED filters, so it trails a keystroke by a render rather
  // than firing on each one. `sortOrder` is deliberately absent: a re-sort keeps
  // every game on screen and must not move the page. So is `groupBy`, which
  // reshuffles shelves without narrowing anything, so it cannot strand the
  // results the way a filter that collapses the document can.
  // Joined on \u0000 rather than a space: a separator that can occur inside a
  // value lets two different filter sets share a signature. Nothing typed into
  // these filters produces one, though a crafted ?search=%00 does, at the cost
  // of one missed scroll adjustment. Written as an escape because a literal NUL
  // byte in the source makes git and grep treat this file as binary.
  const filterSignature =
    view === "played"
      ? [
          "played",
          deferredFilters.search,
          deferredFilters.system,
          deferredFilters.genre,
          deferredFilters.rating,
        ].join("\u0000")
      : [
          "wishlist",
          deferredWishlistFilters.search,
          deferredWishlistFilters.system,
          deferredWishlistFilters.genre,
        ].join("\u0000");
  useKeepResultsInView(resultsRef, headerRef, filterSignature);

  // The props both views pass identically, and now also the props the desktop
  // bar and the mobile sheet pass identically: they render the same choices in
  // two shapes. Spread rather than repeated, so a new shared prop cannot land
  // on one view, or one shape, and not the others.
  //
  // `view` stays a literal at each call site on purpose: FilterControlProps is
  // a discriminated union on it, and that is what still narrows onRatingChange
  // to the played view only.
  const filterControlsCommon = {
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
      {/* One sticky block for all the library chrome: the view tabs and their
          add/stats buttons, the filter status, and the filter bar. Everything a
          visitor navigates WITH stays reachable however far down the shelves
          they are.
          top-[var(--nav-offset)] parks it directly under the site nav.
          z-20 sits above the shelves and below the nav (z-50) and stats panel (z-40).
          rounded-b-lg + shelf-filter-bar separate it from the shelf content
          (shadow in light mode, bottom border in dark).
          No horizontal padding of its own: each row inside pads itself, so the
          tab strip can inset less than px-4 on the narrowest phones (see it in
          GameLibrary). Insetting the whole block by px-4 instead cost the strip
          32px and wrapped "Add game" onto two lines on every phone from 414px
          down.
          The conditional translate drives the mobile hide/show.
          `invisible` is what keeps the hidden block out of the TAB ORDER:
          -translate-y-full only moves it off screen and pointer-events-none
          only stops the mouse, so without it a keyboard user tabs onto the
          view tabs and Stats while they sit behind the nav, and the browser's
          scroll-into-view then yanks the page to the top.
          The transition names `translate`, not `transform`: Tailwind v4 sets
          the standalone `translate` property, so a list without it kills the
          slide. `visibility` transitions discretely, holding `visible` for the
          whole slide-out and flipping the instant it slides back in, so the
          controls stay hidden from the tab order exactly while off screen.
          200ms both ways, matching the pace of the browser's own toolbar. The
          exit was 300ms on the theory that getting out of the way could be
          leisurely; on a device it just read as slow. */}
      <div
        ref={headerRef}
        className={`sticky top-[var(--nav-offset)] z-20 bg-shelf-bg/95 backdrop-blur-sm rounded-b-lg shelf-filter-bar transition-[translate,visibility] duration-200 ${headerVisible ? "translate-y-0" : "-translate-y-full invisible pointer-events-none"}`}
      >
        {tabs}

        {/* Filter status — rendered only while filters are active, so the row
            contributes no height (whitespace) the rest of the time. Inside the
            sticky block so "Clear filters" is reachable from anywhere in a long
            result set; a fixed header height was never a constraint here,
            because one sticky container re-measures itself. */}
        {hasActiveFilters && (
          <div className="flex items-center gap-3 px-4 pt-3">
            <span className="text-shelf-text-muted text-sm">
              {filteredCount} of {activeTotal} games
            </span>
            <Button variant="ghost" size="md" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        )}

        {view === "played" ? (
          <FilterBar
            {...filterControlsCommon}
            onOpenFilterSheet={openFilterSheet}
            filterSheetOpen={filterSheetOpen}
            view="played"
            filters={activeFilters}
            onRatingChange={setRating}
            availableRatings={availableRatings}
          />
        ) : (
          <FilterBar
            {...filterControlsCommon}
            onOpenFilterSheet={openFilterSheet}
            filterSheetOpen={filterSheetOpen}
            view="wishlist"
            filters={activeWishlistFilters}
          />
        )}
      </div>

      {/* Outside the sticky block on purpose: that div carries a `translate`
          for its hide-on-scroll, which would make it the containing block for
          the sheet's `position: fixed`. See the state declaration above. */}
      {view === "played" ? (
        <FilterSheet
          {...filterControlsCommon}
          view="played"
          filters={activeFilters}
          onRatingChange={setRating}
          availableRatings={availableRatings}
          isOpen={filterSheetOpen}
          onClose={closeFilterSheet}
          resultCount={filteredCount}
          onClearFilters={clearFilters}
        />
      ) : (
        <FilterSheet
          {...filterControlsCommon}
          view="wishlist"
          filters={activeWishlistFilters}
          isOpen={filterSheetOpen}
          onClose={closeFilterSheet}
          resultCount={filteredCount}
          onClearFilters={clearFilters}
        />
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
              {canAdd && (
                <Button variant="primary" size="md" className="text-sm" onClick={onAddGame}>
                  {view === "played" ? "Add your first game" : "Add your first wish"}
                </Button>
              )}
            </div>
          ) : (
            <p className="mt-24 text-center text-shelf-text-muted text-lg italic">
              No games match your filters.
            </p>
          )
        ) : (
          // ShelfSection brings its own top margin, so this only needs to
          // offset the group from the filter bar above it. Both halve on
          // phones.
          <div className="mt-3 sm:mt-6">
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
          playHistory={playHistory}
          onRequestHistory={onRequestHistory}
        />
      )}
    </>
  );
}
