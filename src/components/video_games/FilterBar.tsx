"use client";

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
// Not exported: group and sort render only here, on the bar, at every width.
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
  // "A→Z", not "Name A→Z": the control is captioned SORT right beside it, so
  // the noun is redundant, and at 113px on a phone "Name A→Z" needs ~74px of a
  // ~73px text area, clipping the Z off the DEFAULT value every visitor sees.
  "name-asc": "A→Z",
  "name-desc": "Z→A",
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

// The filter/group/sort surface, independent of how it is presented. FilterBar
// renders the filters inline on desktop; FilterSheet renders those same filters
// full-width in the mobile sheet and ignores the group/sort members, which stay
// on the bar at every width. Shared rather than split in two so that adding a
// FILTER cannot land on one shape and not the other.
export type FilterControlProps = PlayedProps | WishlistProps;

type FilterBarProps = FilterControlProps & {
  // Opens the mobile bottom sheet. The sheet itself is rendered by GameShelves,
  // not here: this bar lives inside the sticky header, and that header carries a
  // `translate` for its hide-on-scroll, which makes it the containing block for
  // any `position: fixed` descendant. A sheet rendered from here would be
  // positioned against the header instead of the viewport.
  onOpenFilterSheet: () => void;
  // Only so the opener can carry aria-expanded. Whether the sheet is actually
  // on screen stays GameShelves' business, not this bar's.
  filterSheetOpen: boolean;
};

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

// Roughly what fits in the capped select at text-sm. Only decides whether a
// hover title is worth adding, so an approximation is fine.
const TRUNCATION_HINT_CHARS = 22;

// A <select> is laid out to fit its LONGEST option, not its current value, so
// the 38-character "Construction and Management Simulation" sized the genre
// filter and pushed Sort onto a second row on a desktop. Capping is safe here
// in a way it would not be for the sort labels: the open list is drawn by the
// browser outside this box and still shows every name in full.
//
// Bar only. The mobile sheet sizes its own copies of these selects with
// sheetSelectClass in FilterSheet.tsx; everything here lives inside a
// `hidden sm:contents` wrapper, so a width for the mobile case would only ever
// apply while the element is display:none.
const narrowingFilterWidth = "truncate sm:w-auto sm:max-w-44";

// Renders a <select> with available options at the top and unavailable (disabled) ones below,
// separated by a divider when both groups are present.
//
// Exported for FilterSheet, which renders the same three filters full-width on
// mobile: the enabled/disabled split and its divider are the rule for what is a
// dead end, and two implementations of that rule would eventually disagree.
export function FilterSelect({
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
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // Only on values long enough for the caller's width cap to ellipsize:
      // a tooltip repeating text already on screen is noise, and it delays the
      // one case that needs it.
      title={
        value && formatLabel(value).length > TRUNCATION_HINT_CHARS ? formatLabel(value) : undefined
      }
      className={className}
    >
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
    onOpenFilterSheet,
    filterSheetOpen,
  } = props;

  const groupByOptions = validGroupBy.map((value) => ({ value, label: GROUP_BY_LABELS[value] }));
  const sortOptions = validSortOrder.map((value) => ({ value, label: SORT_LABELS[value] }));

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

          {/* Opens the bottom sheet, which holds the three narrowing filters
              and nothing else: group and sort stay on the bar below (see the
              comment on their row). Hidden from sm up, where the filters are
              laid out inline and there is nothing to open.
              shrink-0 so the search box gives up width first: a truncated
              label would lose the count, while a narrower search box still
              works. */}
          <button
            type="button"
            onClick={onOpenFilterSheet}
            aria-haspopup="dialog"
            // Without this the button announces identically open or closed, so
            // nothing confirms the tap worked.
            aria-expanded={filterSheetOpen}
            className={`${selectClass} sm:hidden shrink-0 flex items-center gap-1.5`}
          >
            <span>Filter</span>
            {activeFilterCount > 0 && (
              // The only thing on screen naming how many filters are applied,
              // now that the controls themselves live in the sheet.
              <span className="rounded-full bg-link px-1.5 text-xs font-semibold text-background">
                {activeFilterCount}
              </span>
            )}
            <ChevronDownIcon aria-hidden className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

        {/* Desktop-only. On a phone these same three filters are rendered
            full-width by FilterSheet, so `hidden` is doing real work:
            it keeps one set of controls perceivable at a time. Two live copies
            would put two controlled <select>s with the same value and the same
            accessible name on the page, which is what a screen reader would
            then announce twice.
            `hidden sm:contents` rather than `hidden sm:flex`: at sm the wrapper
            dissolves and its children become direct items of the parent flex
            row, which is the layout this bar has always had. */}
        <div className="hidden sm:contents">
          {view === "played" && (
            <FilterSelect
              value={props.filters.rating}
              onChange={(v) => props.onRatingChange(v as RatingFilter)}
              allLabel="All Ratings"
              // Unrated last, matching where its shelf lands under
              // groupBy="rating" so the dropdown reads in shelf order.
              options={[...RATINGS.map((r) => r.name), UNRATED_LABEL]}
              available={props.availableRatings}
              className={`${selectClass} ${narrowingFilterWidth}`}
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
            className={`${selectClass} ${narrowingFilterWidth}`}
          />

          {/* Genre filter */}
          <FilterSelect
            value={filters.genre}
            onChange={(v) => onSharedFilterChange("genre", v)}
            allLabel="All Genres"
            options={allGenres}
            available={availableGenres}
            className={`${selectClass} ${narrowingFilterWidth}`}
          />
        </div>

        {/* Visual divider — desktop only */}
        <div className="hidden sm:block w-px h-6 bg-shelf-divider" />

        {/* Group + Sort stay on the bar at EVERY width, unlike the filters
            above. They are a different kind of choice: a filter removes games,
            while these two rearrange the ones already on screen, and nothing
            else on the page hints that regrouping is possible. Behind the
            sheet's tap they were discoverable only by opening something
            labelled "Filter", which is not where anyone looks for sorting.
            Costs one 38px row on a phone, deliberately.
            2-column grid on mobile; sm:contents dissolves the wrapper into the
            parent flex row on desktop. */}
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
