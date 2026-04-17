import { useState, useEffect, useLayoutEffect, useRef } from "react";
import type { Filters, Rating } from "@/lib/games";
import { RATINGS } from "@/lib/games";
import type { WishlistFilters } from "@/lib/wishlist";
import type { GroupBy, SortOrder } from "./libraryConfig";

// search, system, genre behave identically across views — one shared callback
// handles all three. rating is played-only and gets its own typed callback.
type SharedFilterKey = "search" | "system" | "genre";

// All labels live here so FilterBar can pick the right subset per view.
// Parent passes `validGroupBy` / `validSortOrder` and we filter these maps.
const GROUP_BY_LABELS: Record<GroupBy, string> = {
  none: "None",
  system: "System",
  rating: "Rating",
  starred: "Starred",
  genre: "Genre",
  decade: "Decade",
};

const SORT_LABELS: Record<SortOrder, string> = {
  "name-asc": "Name A→Z",
  "name-desc": "Name Z→A",
  "release-newest": "Release: Newest",
  "release-oldest": "Release: Oldest",
  "played-newest": "Last Played: Recent",
  "played-oldest": "Last Played: Oldest",
  "added-newest": "Added: Recent",
  "added-oldest": "Added: Oldest",
  "starred-first": "Starred First",
};

// Minimum scroll distance (px) before toggling filter bar visibility.
// Filters out micro-reversals from slow or momentum scrolling.
const MIN_SCROLL_DELTA = 10;

// Base styles shared between the search input and all select dropdowns.
const inputBaseClass =
  "bg-shelf-input border border-shelf-input-border text-shelf-input-text text-sm rounded " +
  "px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-shelf-input-ring";

// Selects get cursor-pointer on top of the base — inputs don't need it.
const selectClass = `${inputBaseClass} cursor-pointer`;

// --- Props ---
//
// Discriminated union on `view`. Shared layout/search props go in SharedProps.
// The rating-specific callback only appears in PlayedProps — TypeScript narrows
// to it inside `view === "played"` branches.

type SharedProps = {
  groupBy: GroupBy;
  sortOrder: SortOrder;
  validGroupBy: readonly GroupBy[];
  validSortOrder: readonly SortOrder[];
  allSystems: string[];
  allGenres: string[];
  availableSystems: Set<string>;
  availableGenres: Set<string>;
  onSharedFilterChange: (key: SharedFilterKey, value: string) => void;
  onGroupByChange: (v: GroupBy) => void;
  onSortOrderChange: (v: SortOrder) => void;
};

type PlayedProps = SharedProps & {
  view: "played";
  filters: Filters;
  onRatingChange: (value: Rating | "") => void;
  availableRatings: Set<string>;
};

type WishlistProps = SharedProps & {
  view: "wishlist";
  filters: WishlistFilters;
};

type FilterBarProps = PlayedProps | WishlistProps;

type FilterSelectProps = {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  // All possible option values in display order.
  options: string[];
  // Subset of options that produce results given the other active filters.
  // Options not in this set are disabled and sorted to the bottom.
  available: Set<string>;
  className?: string;
};

// Renders a <select> with available options at the top and unavailable (disabled) ones below,
// separated by a divider when both groups are present.
function FilterSelect({
  value,
  onChange,
  allLabel,
  options,
  available,
  className,
}: FilterSelectProps) {
  const enabled = options.filter((o) => available.has(o));
  const disabled = options.filter((o) => !available.has(o));

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">{allLabel}</option>
      {enabled.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      {enabled.length > 0 && disabled.length > 0 && <option disabled>──────────</option>}
      {disabled.map((o) => (
        <option key={o} value={o} disabled>
          {o}
        </option>
      ))}
    </select>
  );
}

// FilterBar owns no state — it receives current values and change-handler callbacks
// from GameLibrary. This is the "controlled component" pattern: the parent owns state,
// the child only renders and reports events.
export function FilterBar(props: FilterBarProps) {
  const {
    view,
    filters,
    groupBy,
    sortOrder,
    validGroupBy,
    validSortOrder,
    allSystems,
    allGenres,
    availableSystems,
    availableGenres,
    onSharedFilterChange,
    onGroupByChange,
    onSortOrderChange,
  } = props;

  // Track whether the bar should be visible. Starts true so it's shown on initial render.
  const [visible, setVisible] = useState(true);
  // Mirror of `visible` as a ref so the scroll handler can always read the current value
  // without capturing a stale closure.
  const visibleRef = useRef(true);
  // Tracks scroll position at the last visibility toggle, not at every scroll event.
  // This lets us measure "how far has the user scrolled since the bar last changed state"
  // rather than "how far since the last pixel of movement", which prevents flip-flopping
  // on slow or jittery scrolls.
  const scrollYAtLastToggle = useRef(0);
  // Cached document-relative top of the bar, measured once at mount before sticky kicks in.
  // Reading offsetTop during scroll is unreliable: once `position: sticky` is active,
  // some browsers (notably Firefox) report offsetTop as 0 (the visual position) rather
  // than the element's natural layout position. getBoundingClientRect().top + scrollY
  // always gives the absolute document position, so we snapshot it once before any scroll.
  const stickyThresholdRef = useRef(0);
  const barRef = useRef<HTMLDivElement>(null);

  // Keep the ref in sync with the state value on every render.
  visibleRef.current = visible;

  // useLayoutEffect runs synchronously after DOM mutations but before the browser paints,
  // so the measurement happens while the element is still in its natural flow position
  // (before any scroll could trigger sticky). This is the correct hook for DOM measurements.
  useLayoutEffect(() => {
    if (barRef.current) {
      // Snapshot the bar's document-relative top position before any scroll happens.
      // This is the exact point where `position: sticky` kicks in, so it's also the
      // point where direction-based hide/show logic should start.
      stickyThresholdRef.current = barRef.current.getBoundingClientRect().top + window.scrollY;
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const stickyThreshold = stickyThresholdRef.current;

      // Near the top of the page: always show regardless of scroll direction.
      // Also keep scrollYAtLastToggle current so the delta starts fresh from
      // wherever the user is when they cross back into the sticky zone.
      if (currentScrollY < stickyThreshold) {
        if (!visibleRef.current) {
          setVisible(true);
        }
        scrollYAtLastToggle.current = currentScrollY;
        return;
      }

      const delta = currentScrollY - scrollYAtLastToggle.current;

      if (delta > MIN_SCROLL_DELTA) {
        // Scrolled down far enough → hide the bar to reclaim screen space.
        setVisible(false);
        scrollYAtLastToggle.current = currentScrollY;
      } else if (delta < -MIN_SCROLL_DELTA) {
        // Scrolled up far enough → user is looking for controls, show the bar.
        setVisible(true);
        scrollYAtLastToggle.current = currentScrollY;
      }
    };

    // MediaQueryList created once, reused across breakpoint changes — never re-allocated
    // on scroll. Its `change` event fires only when the viewport crosses 640px, not on
    // every scroll tick.
    const mql = window.matchMedia("(min-width: 640px)");

    // attachScroll / detachScroll: conditionally wire the scroll listener only on mobile.
    // On desktop the listener is never registered, so there is zero JS overhead per scroll.
    // This also avoids calling setVisible(true) repeatedly when it's already true.
    let scrollAttached = false;

    const attachScroll = () => {
      if (!scrollAttached) {
        // Reset the anchor so the delta is measured from the current position,
        // not a stale value from a previous mobile session.
        scrollYAtLastToggle.current = window.scrollY;
        // Ensure the bar is visible when entering mobile — it may have been hidden
        // during a previous mobile session before the user resized to desktop.
        setVisible(true);
        // { passive: true } tells the browser this handler never calls preventDefault(),
        // allowing it to optimize scroll performance (no need to wait for JS before scrolling).
        window.addEventListener("scroll", handleScroll, { passive: true });
        scrollAttached = true;
      }
    };

    const detachScroll = () => {
      if (scrollAttached) {
        window.removeEventListener("scroll", handleScroll);
        scrollAttached = false;
      }
    };

    // Called immediately and on every viewport-width breakpoint change.
    const onBreakpointChange = () => {
      if (mql.matches) {
        // Switched to desktop: tear down the scroll listener and restore the bar.
        detachScroll();
        setVisible(true);
      } else {
        // Switched to mobile: wire up the scroll listener.
        attachScroll();
      }
    };

    mql.addEventListener("change", onBreakpointChange);
    onBreakpointChange(); // run once for the initial viewport width

    return () => {
      mql.removeEventListener("change", onBreakpointChange);
      detachScroll();
    };
  }, []);

  // Derived per-view option lists for the Group/Sort dropdowns.
  const groupByOptions = validGroupBy.map((value) => ({ value, label: GROUP_BY_LABELS[value] }));
  const sortOptions = validSortOrder.map((value) => ({ value, label: SORT_LABELS[value] }));

  return (
    // sticky: bar stays at the top of the viewport while scrolling through shelves.
    // backdrop-blur-sm: frosted glass effect so content scrolling behind it doesn't clash.
    // rounded-b-lg + shelf-filter-bar: visually separates the bar from shelf content (shadow in light, border in dark).
    // Mobile: flex-col stacks rows cleanly. Desktop (sm+): flex-row wraps everything into one line.
    // transition-transform + conditional translate: animates the bar sliding off/on screen on mobile.
    <div
      ref={barRef}
      className={`sticky top-[var(--nav-height)] z-20 bg-shelf-bg/95 backdrop-blur-sm px-4 py-3 sm:py-4 rounded-b-lg shelf-filter-bar transition-transform duration-300 ${visible ? "translate-y-0" : "-translate-y-full pointer-events-none"}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3 sm:items-center">
        {/* Text search — full-width on mobile so it anchors the top of the bar */}
        <input
          type="search"
          aria-label="Search games"
          placeholder="Search games…"
          value={filters.search}
          onChange={(e) => onSharedFilterChange("search", e.target.value)}
          className={`${inputBaseClass} placeholder:text-shelf-input-placeholder w-full sm:w-auto sm:min-w-44`}
        />

        {/* Filter selects — mobile: 3-col grid when rating shows (played), 2-col when not (wishlist).
            sm:contents dissolves the wrapper into the parent flex row on desktop. */}
        <div
          className={`grid gap-2 sm:contents ${view === "played" ? "grid-cols-3" : "grid-cols-2"}`}
        >
          {/* Rating filter — played view only. The discriminated union narrows here. */}
          {view === "played" && (
            <FilterSelect
              value={props.filters.rating}
              onChange={(v) => props.onRatingChange(v as Rating | "")}
              allLabel="All Ratings"
              options={RATINGS.map((r) => r.name)}
              available={props.availableRatings}
              className={`${selectClass} w-full sm:w-auto`}
            />
          )}

          {/* System filter — options derived from actual game data, not hardcoded */}
          <FilterSelect
            value={filters.system}
            onChange={(v) => onSharedFilterChange("system", v)}
            allLabel="All Systems"
            options={allSystems}
            available={availableSystems}
            className={`${selectClass} w-full sm:w-auto`}
          />

          {/* Genre filter */}
          <FilterSelect
            value={filters.genre}
            onChange={(v) => onSharedFilterChange("genre", v)}
            allLabel="All Genres"
            options={allGenres}
            available={availableGenres}
            className={`${selectClass} w-full sm:w-auto`}
          />
        </div>

        {/* Visual divider — desktop only */}
        <div className="hidden sm:block w-px h-6 bg-shelf-divider" />

        {/* Group + Sort — 2-column grid on mobile, inline on desktop.
            sm:contents dissolves the wrapper into the parent flex row on desktop. */}
        <div className="grid grid-cols-2 gap-2 sm:contents">
          {/* Group by */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-shelf-control-label text-xs uppercase tracking-wide whitespace-nowrap">
              Group
            </span>
            <select
              value={groupBy}
              onChange={(e) => onGroupByChange(e.target.value as GroupBy)}
              className={`${selectClass} flex-1 min-w-0 sm:flex-none`}
            >
              {groupByOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort within shelf */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-shelf-control-label text-xs uppercase tracking-wide whitespace-nowrap">
              Sort
            </span>
            <select
              value={sortOrder}
              onChange={(e) => onSortOrderChange(e.target.value as SortOrder)}
              className={`${selectClass} flex-1 min-w-0 sm:flex-none`}
            >
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
