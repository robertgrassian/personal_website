"use client";

// The mobile filter surface: a bottom sheet with one labelled, full-width
// dropdown per narrowing filter.
//
// Filters ONLY. Group and sort deliberately stay on the bar at every width
// (see FilterBar): they rearrange what is on screen rather than removing
// anything, and burying them behind a control labelled "Filter" is not where
// anyone looks for sorting. This sheet holds the dimensions that answer
// "show me fewer games", and nothing else.
//
// Why a sheet and not more of the bar. The bar is inside the sticky header, so
// anything it shows costs that height on every scroll-up, and a phone gives an
// inline <select> about 117px, which truncates its own label. Here each select
// gets the full width of the screen, so "Role-playing (RPG)" and
// "Super Nintendo Entertainment System" render whole.
//
// Why dropdowns and not chips. Chips were built first and replaced: they show
// every option at once, which is exactly what does not scale. A library with 25
// genres and 20 systems becomes a wall to scroll past, while three dropdowns
// stay three dropdowns no matter how large the vocabulary grows.
//
// Rendered by GameShelves as a sibling of the sticky header, never from inside
// FilterBar. The header carries a `translate` for its hide-on-scroll behavior,
// and a non-`none` transform makes an element the containing block for its
// `position: fixed` descendants — a sheet rendered from the bar would position
// itself against the header rather than the viewport.

import { useRef, type ReactNode } from "react";
import { RATINGS, UNRATED_LABEL, systemLabel, type RatingFilter } from "@/lib/games";
import { CloseIcon } from "@/components/Icon";
import { useModalChrome } from "./useModalChrome";
import { ModalBackdrop } from "./ModalBackdrop";
import { FilterSelect, type FilterControlProps } from "./FilterBar";
import { accentButtonClass, filterSelectClass } from "./formStyles";

// The full control union, group/sort members included, even though this
// component renders only the filters. GameShelves spreads one object into both
// shapes, so sharing the type is what stops a NEW FILTER landing on the desktop
// bar and not here. The group/sort props simply go unread.
type FilterSheetProps = FilterControlProps & {
  isOpen: boolean;
  onClose: () => void;
  // Survivors of the current filters, for the confirm button. Filters apply
  // live, so this is a running readout of what closing the sheet will reveal,
  // not a preview of an unapplied change.
  resultCount: number;
  onClearFilters: () => void;
};

// A <label> wrapping its control, so the caption is associated with the select
// without an id/htmlFor pair to keep unique.
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-shelf-label">
        {label}
      </span>
      {children}
    </label>
  );
}

// Full width, so the value is never the thing that gets truncated. This is the
// whole reason the sheet can afford dropdowns where the bar could not.
const sheetSelectClass = `${filterSelectClass} w-full`;

export function FilterSheet(props: FilterSheetProps) {
  // `view` is deliberately not destructured: every branch below narrows on
  // `props.view` instead, because checking a destructured discriminant does not
  // narrow `props`, and `props.filters.rating` needs it to.
  const {
    filters,
    allSystems,
    allGenres,
    availableSystems,
    availableGenres,
    onSharedFilterChange,
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
      <ModalBackdrop
        onClose={onClose}
        className={`z-30 transition-opacity duration-300 sm:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        aria-hidden={!isOpen}
        inert={!isOpen}
        // max-h-[85vh] leaves the shelves visible above the sheet, so it reads
        // as a layer over the library rather than a new page.
        //
        // No --safe-bottom padding here, unlike the other edge-pinned surfaces:
        // the action row at the foot of this sheet already pads itself with
        // max(1rem, env(safe-area-inset-bottom)), which was inert until
        // viewport-fit=cover made the inset non-zero. Adding it here too would
        // apply the gap twice.
        className={`fixed inset-x-0 bottom-0 z-40 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-divider bg-background shadow-2xl transition-transform duration-300 ease-out sm:hidden ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-divider px-5 py-4">
          <h2 className="text-base font-bold text-emphasis">Filters</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-divider hover:text-foreground"
          >
            <CloseIcon className="h-5 w-5 cursor-pointer" aria-hidden />
          </button>
        </div>

        {/* min-h-0 rather than flex-1: the sheet is sized by its content and
            only capped at 85vh, so the body must be free to shrink and scroll
            when a very long option list pushes it past the cap, without being
            stretched when it does not. Three dropdowns rarely reach it.

            overscroll-contain because the scroll lock hands this region its own
            gestures: a flick past the end must stop here rather than chain to
            the page it is holding still. */}
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-5">
          {props.view === "played" && (
            <Field label="Rating">
              <FilterSelect
                value={props.filters.rating}
                onChange={(v) => props.onRatingChange(v as RatingFilter)}
                allLabel="All ratings"
                // Unrated last, matching where its shelf lands under
                // groupBy="rating" so the list reads in shelf order.
                options={[...RATINGS.map((r) => r.name), UNRATED_LABEL]}
                available={props.availableRatings}
                className={sheetSelectClass}
              />
            </Field>
          )}

          <Field label="System">
            <FilterSelect
              value={filters.system}
              onChange={(v) => onSharedFilterChange("system", v)}
              allLabel="All systems"
              options={allSystems}
              available={availableSystems}
              formatLabel={systemLabel}
              className={sheetSelectClass}
            />
          </Field>

          <Field label="Genre">
            <FilterSelect
              value={filters.genre}
              onChange={(v) => onSharedFilterChange("genre", v)}
              allLabel="All genres"
              options={allGenres}
              available={availableGenres}
              className={sheetSelectClass}
            />
          </Field>
        </div>

        {/* pb picks whichever is larger, the padding or the iPhone home
            indicator inset, so the confirm button is never under it. */}
        <div className="flex shrink-0 items-center gap-3 border-t border-divider px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClearFilters}
            disabled={!hasActiveFilters}
            // "Clear filters", not "Clear all": `clearFilters` deletes search,
            // rating, system and genre only, deliberately leaving groupBy and
            // sortOrder in the URL. Those are not in this sheet, but they are
            // still state a visitor would expect "all" to have covered.
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
