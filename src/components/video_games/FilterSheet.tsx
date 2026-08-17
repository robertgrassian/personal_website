"use client";

// The mobile filter surface: a bottom sheet holding every filter plus group and
// sort, as tappable chips rather than dropdowns.
//
// Why a sheet and not more of the bar. The bar is inside the sticky header, so
// anything it shows costs that height on every scroll-up, and a phone gives a
// <select> about 117px, which is not enough to show a list of systems. A sheet
// costs nothing until opened and then has the whole screen: every option of
// every dimension visible at once, at a touch-sized target, instead of one
// native dropdown at a time.
//
// Rendered by GameShelves as a sibling of the sticky header, never from inside
// FilterBar. The header carries a `translate` for its hide-on-scroll behavior,
// and a non-`none` transform makes an element the containing block for its
// `position: fixed` descendants — a sheet rendered from the bar would position
// itself against the header rather than the viewport.

import { useRef } from "react";
import { RATINGS, UNRATED_LABEL, systemLabel, type RatingFilter } from "@/lib/games";
import { CloseIcon } from "@/components/Icon";
import { useModalChrome } from "./useModalChrome";
import { GROUP_BY_LABELS, SORT_LABELS, type FilterControlProps } from "./FilterBar";
import type { GroupBy, SortOrder } from "./libraryConfig";
import { accentButtonClass } from "./formStyles";

type FilterSheetProps = FilterControlProps & {
  isOpen: boolean;
  onClose: () => void;
  // Survivors of the current filters, for the confirm button. Filters apply
  // live, so this is a running readout of what closing the sheet will reveal,
  // not a preview of an unapplied change.
  resultCount: number;
  onClearFilters: () => void;
};

type ChipProps = {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

// text-sm rather than the 16px the filter fields use: that rule exists because
// mobile Safari zooms when a control you can type into takes focus, and a
// button is not one. Smaller type fits more chips per row.
function Chip({ selected, disabled = false, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // aria-pressed rather than role="radio": these read as toggles, and a
      // radiogroup would owe the user arrow-key roving focus that plain
      // buttons do not.
      aria-pressed={selected}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        selected
          ? "border-link bg-link font-medium text-background"
          : "border-shelf-input-border bg-shelf-input text-shelf-input-text"
      } ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}

type ChipGroupProps = {
  label: string;
  // Omit for group/sort, which always have a value and so have no "all" state.
  allLabel?: string;
  value: string;
  options: readonly string[];
  // Options that would still yield results. Omit when every option always
  // applies. Same rule the desktop <select> uses, so the two agree on which
  // choices are dead ends.
  available?: Set<string>;
  onChange: (value: string) => void;
  formatLabel?: (option: string) => string;
};

function ChipGroup({
  label,
  allLabel,
  value,
  options,
  available,
  onChange,
  formatLabel = (option) => option,
}: ChipGroupProps) {
  // Dead-end options sort below the live ones, matching FilterSelect. A chip
  // that is currently selected stays enabled even if it has become
  // unavailable, or there would be no way to switch off the filter you are
  // looking at.
  const isDisabled = (option: string) =>
    available !== undefined && !available.has(option) && option !== value;
  const ordered = [...options].sort((a, b) => Number(isDisabled(a)) - Number(isDisabled(b)));

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-shelf-label">
        {label}
      </h3>
      <div className="flex flex-wrap gap-2">
        {allLabel !== undefined && (
          <Chip selected={value === ""} onClick={() => onChange("")}>
            {allLabel}
          </Chip>
        )}
        {ordered.map((option) => (
          <Chip
            key={option}
            selected={value === option}
            disabled={isDisabled(option)}
            onClick={() => onChange(option)}
          >
            {formatLabel(option)}
          </Chip>
        ))}
      </div>
    </section>
  );
}

export function FilterSheet(props: FilterSheetProps) {
  // `view` is deliberately not destructured: every branch below narrows on
  // `props.view` instead, because checking a destructured discriminant does not
  // narrow `props`, and `props.filters.rating` needs it to.
  const {
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
    isOpen,
    onClose,
    resultCount,
    onClearFilters,
  } = props;

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Stays mounted while closed so the slide-up has something to animate, hence
  // `enabled={isOpen}` — the same arrangement StatsPanel uses, as opposed to
  // the mount-only owner dialogs.
  useModalChrome(onClose, closeButtonRef, isOpen);

  const hasActiveFilters =
    filters.search !== "" ||
    filters.system !== "" ||
    filters.genre !== "" ||
    (props.view === "played" && props.filters.rating !== "");

  return (
    <>
      {/* Backdrop. sm:hidden on both halves: the sheet is a phone affordance,
          and on desktop every one of these controls is already inline in the
          bar, so a stuck-open state must not be able to cover that. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity duration-300 sm:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Filter and sort"
        aria-hidden={!isOpen}
        inert={!isOpen}
        // max-h-[85vh] leaves the shelves visible above the sheet, so it reads
        // as a layer over the library rather than a new page.
        className={`fixed inset-x-0 bottom-0 z-40 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-divider bg-background shadow-2xl transition-transform duration-300 ease-out sm:hidden ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-divider px-5 py-4">
          <h2 className="text-base font-bold text-emphasis">Filter &amp; sort</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close filter and sort"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-divider hover:text-foreground"
          >
            <CloseIcon className="h-5 w-5 cursor-pointer" aria-hidden />
          </button>
        </div>

        {/* Scrolls when the library has enough systems or genres to overflow,
            which is the case a fixed-height panel could not have handled. */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          {props.view === "played" && (
            <ChipGroup
              label="Rating"
              allLabel="All ratings"
              value={props.filters.rating}
              // Unrated last, matching where its shelf lands under
              // groupBy="rating" so the chips read in shelf order.
              options={[...RATINGS.map((r) => r.name), UNRATED_LABEL]}
              available={props.availableRatings}
              onChange={(v) => props.onRatingChange(v as RatingFilter)}
            />
          )}

          <ChipGroup
            label="System"
            allLabel="All systems"
            value={filters.system}
            options={allSystems}
            available={availableSystems}
            formatLabel={systemLabel}
            onChange={(v) => onSharedFilterChange("system", v)}
          />

          <ChipGroup
            label="Genre"
            allLabel="All genres"
            value={filters.genre}
            options={allGenres}
            available={availableGenres}
            onChange={(v) => onSharedFilterChange("genre", v)}
          />

          <ChipGroup
            label="Group by"
            value={groupBy}
            options={validGroupBy}
            formatLabel={(o) => GROUP_BY_LABELS[o as GroupBy]}
            onChange={(v) => onGroupByChange(v as GroupBy)}
          />

          <ChipGroup
            label="Sort by"
            value={sortOrder}
            options={validSortOrder}
            formatLabel={(o) => SORT_LABELS[o as SortOrder]}
            onChange={(v) => onSortOrderChange(v as SortOrder)}
          />
        </div>

        {/* pb picks whichever is larger, the padding or the iPhone home
            indicator inset, so the confirm button is never under it. */}
        <div className="flex shrink-0 items-center gap-3 border-t border-divider px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClearFilters}
            disabled={!hasActiveFilters}
            // "Clear filters", not "Clear all": it leaves group and sort alone,
            // and those are in this sheet too.
            className="shrink-0 text-sm text-muted underline underline-offset-4 transition-colors hover:text-foreground disabled:cursor-default disabled:no-underline disabled:opacity-40"
          >
            Clear filters
          </button>
          {/* Filters apply as they are tapped, so this only dismisses. It is
              still the primary button: it carries the count, which is the
              feedback the shelves would give if the sheet were not over them. */}
          <button type="button" onClick={onClose} className={`${accentButtonClass} flex-1 text-sm`}>
            Show {resultCount} {resultCount === 1 ? "game" : "games"}
          </button>
        </div>
      </aside>
    </>
  );
}
