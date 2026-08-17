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

const SORT_LABELS: Record<SortOrder, string> = {
  "name-asc": "Name A→Z",
  "name-desc": "Name Z→A",
  "rating-best": "Rating: Best",
  "rating-worst": "Rating: Worst",
  "release-newest": "Release: Newest",
  "release-oldest": "Release: Oldest",
  "played-newest": "Last Played: Recent",
  "played-oldest": "Last Played: Oldest",
  "added-newest": "Added: Recent",
  "added-oldest": "Added: Oldest",
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

  return (
    // Horizontal padding and the frosted background belong to the sticky
    // container in GameShelves; this only owns the vertical rhythm of its own
    // row. Mobile: flex-col stacks rows cleanly. Desktop (sm+): flex-row wraps
    // everything into one line.
    <div className="py-3 sm:py-4">
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

        {/* Mobile: 3-col when rating shows (played), 2-col otherwise.
            sm:contents dissolves the wrapper into the parent flex row on desktop. */}
        <div
          className={`grid gap-2 sm:contents ${view === "played" ? "grid-cols-3" : "grid-cols-2"}`}
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
