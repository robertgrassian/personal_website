import type { Filters, Rating } from "@/lib/games";
import { RATINGS } from "@/lib/games";
import type { GroupBy, SortOrder } from "./GameLibrary";

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "None" },
  { value: "system", label: "System" },
  { value: "rating", label: "Rating" },
  { value: "genre", label: "Genre" },
  { value: "decade", label: "Decade" },
];

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "name-asc", label: "Name A→Z" },
  { value: "name-desc", label: "Name Z→A" },
  { value: "release-newest", label: "Release: Newest" },
  { value: "release-oldest", label: "Release: Oldest" },
  { value: "played-newest", label: "Played: Newest" },
  { value: "played-oldest", label: "Played: Oldest" },
];

type FilterBarProps = {
  filters: Filters;
  // Generic callback: onFilterChange("rating", "Great") updates just that key.
  // The <K extends keyof Filters> constraint ensures the key and value types always agree —
  // you can't pass onFilterChange("rating", "Nintendo Switch").
  onFilterChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  groupBy: GroupBy;
  sortOrder: SortOrder;
  allSystems: string[];
  allGenres: string[];
  // Sets of values that still have matching games given the other active filters.
  // Options not in the set are disabled so the user can't pick a dead-end combination.
  availableRatings: Set<string>;
  availableSystems: Set<string>;
  availableGenres: Set<string>;
  onGroupByChange: (v: GroupBy) => void;
  onSortOrderChange: (v: SortOrder) => void;
};

// Base styles shared between the search input and all select dropdowns.
const inputBaseClass =
  "bg-shelf-input border border-shelf-input-border text-shelf-input-text text-sm rounded " +
  "px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-shelf-input-ring";

// Selects get cursor-pointer on top of the base — inputs don't need it.
const selectClass = `${inputBaseClass} cursor-pointer`;

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
export function FilterBar({
  filters,
  onFilterChange,
  groupBy,
  sortOrder,
  allSystems,
  allGenres,
  availableRatings,
  availableSystems,
  availableGenres,
  onGroupByChange,
  onSortOrderChange,
}: FilterBarProps) {
  return (
    // sticky: bar stays at the top of the viewport while scrolling through shelves.
    // backdrop-blur-sm: frosted glass effect so content scrolling behind it doesn't clash.
    // rounded-b-lg + shadow (light) / border-b (dark): visually separates the bar from shelf content.
    // Mobile: flex-col stacks rows cleanly. Desktop (sm+): flex-row wraps everything into one line.
    <div className="sticky top-0 z-20 bg-shelf-bg/95 backdrop-blur-sm px-4 py-3 sm:py-4 rounded-b-lg shadow-md dark:shadow-none dark:border-b dark:border-shelf-divider">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3 sm:items-center">
        {/* Text search — full-width on mobile so it anchors the top of the bar */}
        <input
          type="search"
          aria-label="Search games"
          placeholder="Search games…"
          value={filters.search}
          onChange={(e) => onFilterChange("search", e.target.value)}
          className={`${inputBaseClass} placeholder:text-shelf-input-placeholder w-full sm:w-auto sm:min-w-44`}
        />

        {/* Filter selects — 3-column grid on mobile so columns are hard equal-width (no min-width blowout).
            sm:contents dissolves the wrapper into the parent flex row on desktop. */}
        <div className="grid grid-cols-3 gap-2 sm:contents">
          {/* Rating filter */}
          <FilterSelect
            value={filters.rating}
            onChange={(v) => onFilterChange("rating", v as Rating | "")}
            allLabel="All Ratings"
            options={RATINGS.map((r) => r.name)}
            available={availableRatings}
            className={`${selectClass} w-full sm:w-auto`}
          />

          {/* System filter — options derived from actual game data, not hardcoded */}
          <FilterSelect
            value={filters.system}
            onChange={(v) => onFilterChange("system", v)}
            allLabel="All Systems"
            options={allSystems}
            available={availableSystems}
            className={`${selectClass} w-full sm:w-auto`}
          />

          {/* Genre filter */}
          <FilterSelect
            value={filters.genre}
            onChange={(v) => onFilterChange("genre", v)}
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
              {GROUP_BY_OPTIONS.map((o) => (
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
              {SORT_OPTIONS.map((o) => (
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
