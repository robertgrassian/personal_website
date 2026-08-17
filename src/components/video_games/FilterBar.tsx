"use client";

import { useState } from "react";
import { ChevronDownIcon } from "@/components/Icon";
import type { Filters, RatingFilter } from "@/lib/games";
import { RATINGS, UNRATED_LABEL, systemLabel } from "@/lib/games";
import type { WishlistFilters } from "@/lib/wishlist";
import type { GroupBy, SortOrder } from "./libraryConfig";
// Filter keys shared by both views — one setter handles all three. `rating` is
// played-only and gets its own typed callback in PlayedProps. Imported rather
// than re-declared: this and the hook must agree on the key set, and two
// identical unions in two files agree only by luck.
import type { SharedFilterKey } from "./useGameLibraryUrlState";
// Base styles shared between the search input and all select dropdowns, from
// the same source the modal fields use.
import { filterFieldClass as inputBaseClass, filterSelectClass as selectClass } from "./formStyles";

// Full label maps; parent passes `validGroupBy`/`validSortOrder` to pick the subset.
const GROUP_BY_LABELS: Record<GroupBy, string> = {
  none: "None",
  system: "System",
  rating: "Rating",
  genre: "Genre",
  decade: "Decade",
};

// Every label leads with the word that distinguishes it from its opposite,
// which is a legibility constraint rather than a style preference: the sort
// <select> renders 117px wide on a 390px phone, about nine characters of
// visible text, and a native select truncates without an ellipsis. Under the
// old "Noun: Modifier" form that clipped "Release: Newest" and
// "Release: Oldest" to the identical "Release: ", and both Last Played options
// to "Last Play" — the direction, the only thing the option chose, was the
// part that fell off. Keep new labels differing within their first ~9
// characters.
const SORT_LABELS: Record<SortOrder, string> = {
  "name-asc": "Name A→Z",
  "name-desc": "Name Z→A",
  "rating-best": "Best rated",
  "rating-worst": "Worst rated",
  "release-newest": "Newest release",
  "release-oldest": "Oldest release",
  "played-newest": "Recently played",
  // "Least recently played", not "Oldest played", which reads as a property of
  // the game rather than of when it was last touched.
  "played-oldest": "Least recently played",
  "added-newest": "Recently added",
  "added-oldest": "First added",
};

// Props are a discriminated union on `view` — rating-specific props only
// exist in PlayedProps, and TS narrows to them inside `view === "played"`.

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
  onRatingChange: (value: RatingFilter) => void;
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
  formatLabel?: (option: string) => string;
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
  // Renames an option for display without changing the value submitted. Only
  // the system filter needs it, because systems are stored under IGDB's names
  // and a couple of those read badly ("PC (Microsoft Windows)"). The option's
  // value stays the stored string, so filtering and `?system=` are unaffected.
  formatLabel = (option: string) => option,
}: FilterSelectProps) {
  const enabled = options.filter((o) => available.has(o));
  const disabled = options.filter((o) => !available.has(o));

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">{allLabel}</option>
      {enabled.map((o) => (
        <option key={o} value={o}>
          {formatLabel(o)}
        </option>
      ))}
      {enabled.length > 0 && disabled.length > 0 && <option disabled>──────────</option>}
      {disabled.map((o) => (
        <option key={o} value={o} disabled>
          {formatLabel(o)}
        </option>
      ))}
    </select>
  );
}

// FilterBar owns no state — it receives current values and change-handler callbacks
// from GameLibrary. This is the "controlled component" pattern: the parent owns state,
// the child only renders and reports events.
//
// Positioning is not its business either: it renders as a plain block, and the
// sticky container in GameShelves holds it alongside the tab strip so the two
// stick, hide and reappear as one unit.
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

  const groupByOptions = validGroupBy.map((value) => ({ value, label: GROUP_BY_LABELS[value] }));
  const sortOptions = validSortOrder.map((value) => ({ value, label: SORT_LABELS[value] }));

  // Phones only: the three narrowing filters collapse behind one button, so the
  // bar is two rows instead of three. Desktop ignores this entirely — the panel
  // is `sm:contents` there, so it is always laid out inline and this state
  // never reaches a CSS rule.
  //
  // Starts closed even when the URL arrives with filters applied (a shared
  // ?genre= link). The button's count and the "N of M games / Clear filters"
  // row above both say that something is filtering, which is the part that
  // must not be silent; opening the panel unasked would spend the height this
  // change exists to save.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Read off `props`, not the destructured `view`: narrowing the union needs
  // the discriminant checked on the object it discriminates.
  //
  // Search is deliberately not counted. It has its own always-visible box, so
  // including it would badge the button for a filter the button does not hold.
  const activeFilterCount =
    (filters.system === "" ? 0 : 1) +
    (filters.genre === "" ? 0 : 1) +
    (props.view === "played" && props.filters.rating !== "" ? 1 : 0);

  return (
    // The frosted background and sticky positioning belong to the container in
    // GameShelves; the padding stays here so the container can span the full
    // content width and let the tab strip use all of it.
    // Mobile: flex-col stacks rows cleanly. Desktop (sm+): flex-row wraps
    // everything into one line.
    <div className="px-4 py-3 sm:py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3 sm:items-center">
        {/* Row one on a phone: search, then the button that discloses the
            filters below it. Both narrow the library, so they belong together;
            Group and Sort arrange what survives and share the row underneath.
            sm:contents dissolves this into the parent flex row on desktop,
            where the button is hidden and the search box sizes as before. */}
        <div className="flex items-center gap-2 sm:contents">
          <input
            type="search"
            aria-label="Search games"
            placeholder="Search games…"
            value={filters.search}
            onChange={(e) => onSharedFilterChange("search", e.target.value)}
            // sm:flex-initial, not sm:flex-none: it restores the default
            // `flex: 0 1 auto` this input had before it gained flex-1, so the
            // desktop row keeps its old shrink behavior exactly.
            className={`${inputBaseClass} placeholder:text-shelf-input-placeholder min-w-0 flex-1 sm:w-auto sm:flex-initial sm:min-w-44`}
          />

          {/* Hidden from sm up, where the filters are laid out inline and there
              is nothing to disclose.
              shrink-0 so the search box gives up width first: a truncated
              "Filter (2)" would hide the count, while a narrower search box
              still works. */}
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="library-filter-panel"
            className={`${selectClass} sm:hidden shrink-0 flex items-center gap-1.5`}
          >
            <span>Filter</span>
            {activeFilterCount > 0 && (
              // The count is the only thing on screen naming how many filters
              // are hiding in there while the panel is shut.
              <span className="rounded-full bg-link px-1.5 text-xs font-semibold text-background">
                {activeFilterCount}
              </span>
            )}
            <ChevronDownIcon
              aria-hidden
              className={`w-3.5 h-3.5 shrink-0 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* The narrowing filters. Three states in one element:

            mobile closed   hidden, costing no height (the default)
            mobile open     a grid directly under the row above, which is where
                            it already sits in DOM order
            desktop         sm:contents, so the selects become direct children
                            of the parent flex row exactly as before and
                            `filtersOpen` has no effect at all

            One DOM node for both layouts, rather than a mobile copy and a
            desktop copy: duplicating them would put two controlled <select>s
            with the same value and the same accessible name on the page.
            Because every wrapper in this bar is sm:contents, DOM order alone
            decides the desktop line, so no `order` classes are needed to keep
            the two layouts from fighting. */}
        <div
          id="library-filter-panel"
          className={`${filtersOpen ? "grid" : "hidden"} gap-2 sm:contents ${
            view === "played" ? "grid-cols-3" : "grid-cols-2"
          }`}
        >
          {view === "played" && (
            <FilterSelect
              value={props.filters.rating}
              onChange={(v) => props.onRatingChange(v as RatingFilter)}
              allLabel="All Ratings"
              // Unrated last, matching where its shelf lands under
              // groupBy="rating" so the dropdown reads in shelf order.
              options={[...RATINGS.map((r) => r.name), UNRATED_LABEL]}
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
            formatLabel={systemLabel}
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
