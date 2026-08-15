"use client";

import { RATINGS, type Rating } from "@/lib/games";

// The five-letter rating grid, shared by every surface that lets you pick one.
//
// The colors are applied with `style` rather than Tailwind classes on purpose:
// each rating's color is a CSS custom property (--rating-s … --rating-f in
// globals.css), and Tailwind cannot generate a utility per rating from a value
// it only learns at runtime. Those variables carry light and dark values, so
// the inline style is still theme-aware.
//
// This is NOT the same thing as RatingIndicator / RatingBadge / RatingRibbon —
// those are non-interactive badges for shelf cases and render a rating you
// already have, rather than offering the five choices.

type RatingPickerProps = {
  /** The currently selected rating, or "" for none. */
  value?: Rating | "";
  /** Receives "" when an already-selected rating is clicked and `clearable`. */
  onPick: (rating: Rating | "") => void;
  /** "compact" is a letter only; "labeled" stacks the letter over its name. */
  variant?: "compact" | "labeled";
  disabled?: boolean;
  /** When false, clicking the selected rating re-picks it instead of clearing. */
  clearable?: boolean;
  /** Overrides the title/aria-label text. Used by the "how was it?" prompt,
   *  which is `clearable={false}`: the default would label the selected tile
   *  "Remove rating" in a grid where clicking it cannot remove anything. */
  describe?: (ratingName: string, active: boolean) => string;
};

const defaultDescribe = (ratingName: string, active: boolean) =>
  active ? "Remove rating" : `Rate ${ratingName}`;

export function RatingPicker({
  value = "",
  onPick,
  variant = "compact",
  disabled = false,
  clearable = true,
  describe = defaultDescribe,
}: RatingPickerProps) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {RATINGS.map((r) => {
        const active = r.name === value;
        const label = describe(r.name, active);
        return (
          <button
            key={r.letter}
            type="button"
            // aria-pressed makes these read as toggles rather than as five
            // separate actions, which is what they are: picking one deselects
            // the others.
            aria-pressed={active}
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={() => onPick(active && clearable ? "" : r.name)}
            className={
              (variant === "labeled"
                ? "flex flex-col items-center gap-0.5 rounded-md border py-2 "
                : "rounded-md border py-1.5 text-sm font-bold ") +
              "transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default " +
              (active
                ? "border-transparent text-black/80"
                : "border-shelf-plank text-shelf-text hover:bg-shelf-input")
            }
            // Selected: the rating's color fills the button. Unselected in the
            // compact variant: it tints the letter. The labeled variant colors
            // its letter on the inner span instead, so the name below stays
            // readable in the normal text color.
            style={
              active
                ? { backgroundColor: r.color }
                : variant === "compact"
                  ? { color: r.color }
                  : undefined
            }
          >
            {variant === "labeled" ? (
              <>
                <span
                  className="text-base font-bold leading-none"
                  style={active ? undefined : { color: r.color }}
                >
                  {r.letter}
                </span>
                <span className="text-[10px] leading-none">{r.name}</span>
              </>
            ) : (
              r.letter
            )}
          </button>
        );
      })}
    </div>
  );
}
