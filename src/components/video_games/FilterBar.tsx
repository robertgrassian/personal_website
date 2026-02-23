import type { Filters, Rating } from "@/lib/games";
import type { GroupBy, SortOrder } from "./GameLibrary";

const RATINGS: Rating[] = ["Perfect", "Great", "Good", "Okay", "Bad"];

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
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
  onGroupByChange: (v: GroupBy) => void;
  onSortOrderChange: (v: SortOrder) => void;
};

// Base styles shared between the search input and all select dropdowns.
const inputBaseClass =
  "bg-shelf-input border border-shelf-input-border text-shelf-input-text text-sm rounded " +
  "px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-shelf-input-ring";

// Selects get cursor-pointer on top of the base — inputs don't need it.
const selectClass = `${inputBaseClass} cursor-pointer`;

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
  onGroupByChange,
  onSortOrderChange,
}: FilterBarProps) {
  return (
    // sticky: bar stays at the top of the viewport while scrolling through shelves.
    // backdrop-blur-sm: frosted glass effect so content scrolling behind it doesn't clash.
    <div className="sticky top-0 z-20 bg-shelf-bg/95 backdrop-blur-sm py-4 border-b border-shelf-bar-line">
      <div className="flex flex-wrap gap-3 items-center">
        {/* Text search */}
        <input
          type="search"
          placeholder="Search games…"
          value={filters.search}
          onChange={(e) => onFilterChange("search", e.target.value)}
          className={`${inputBaseClass} placeholder:text-shelf-input-placeholder min-w-44`}
        />

        {/* Rating filter */}
        <select
          value={filters.rating}
          onChange={(e) => onFilterChange("rating", e.target.value as Rating | "")}
          className={selectClass}
        >
          <option value="">All Ratings</option>
          {RATINGS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        {/* System filter — options derived from actual game data, not hardcoded */}
        <select
          value={filters.system}
          onChange={(e) => onFilterChange("system", e.target.value)}
          className={selectClass}
        >
          <option value="">All Systems</option>
          {allSystems.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Genre filter */}
        <select
          value={filters.genre}
          onChange={(e) => onFilterChange("genre", e.target.value)}
          className={selectClass}
        >
          <option value="">All Genres</option>
          {allGenres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        {/* Visual divider — hidden on small screens */}
        <div className="hidden sm:block w-px h-6 bg-shelf-divider" />

        {/* Group by */}
        <div className="flex items-center gap-2">
          <span className="text-shelf-control-label text-xs uppercase tracking-wide">Group</span>
          <select
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value as GroupBy)}
            className={selectClass}
          >
            {GROUP_BY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sort within shelf */}
        <div className="flex items-center gap-2">
          <span className="text-shelf-control-label text-xs uppercase tracking-wide">Sort</span>
          <select
            value={sortOrder}
            onChange={(e) => onSortOrderChange(e.target.value as SortOrder)}
            className={selectClass}
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
  );
}
