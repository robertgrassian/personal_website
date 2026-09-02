// The site's button recipes, as class strings behind the components in this
// directory. Import <Button> rather than these; they are exported for the few
// call sites that must render their own element (a next/link that has to look
// like a button, MenuItem's polymorphic row).
//
// THE RULE: hierarchy comes from fill, and a surface has AT MOST ONE filled
// button, its primary action. Everything else there is outlined, text-only, or
// quiet chrome.
//
// "Surface" means whatever is in focus, not the whole screen. An open dialog is
// a surface of its own, so its primary may be filled while the page CTA behind
// it is too. A surface may also have ZERO fills: the detail card with nothing
// edited has no primary action, and the fill arrives with Save.
//
// Red is never filled, as trigger or as confirm. A filled red button beside
// Cancel reads as the default, which a destructive confirm must never be, so
// the confirm sheet is the one surface that deliberately runs with no fill at
// all.
//
// A selected toggle is a STATE, not a primary action, so it does not take the
// fill either. Selected tabs and pills use accent border plus accent text; see
// TabBar and ToggleGroup.
//
// This replaced an earlier rule where filled meant "commits a pending draft".
// That one was followed exactly and still read as inconsistent: it left the add
// dialog's own primary action outlined, and it paired a tinted destructive
// trigger with an outlined confirm in the same interaction.
//
// Every recipe encodes a light/dark pairing, and the repo's rule is that no
// color may work in only one scheme. That is most of why these are components
// now: a copied-and-tweaked literal breaks the rule easily, since the tweak is
// usually made while looking at one scheme.

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "subtle";

/** "none" emits no padding or text size, for the handful of call sites with
 *  their own (MenuItem's rows, the library header's actions). Tailwind cannot
 *  resolve a `px-3` passed in `className` against a `px-3` from here, so
 *  opting out is the only reliable way to override one. */
export type ButtonSize = "sm" | "md" | "none";

const sizeClass: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  // No text size on purpose: call sites set their own, because the onboarding
  // submit is deliberately a step larger than the in-library CTAs.
  md: "px-4 py-2",
  none: "",
};

// cursor-pointer is not redundant anywhere below: Tailwind v4's preflight sets
// buttons to cursor: default, so a <button> would otherwise show an arrow while
// an <a> styled the same way shows a hand.
const disabledClass = "disabled:opacity-50 disabled:cursor-default";

const variantClass: Record<ButtonVariant, string> = {
  // `bg-link` with `text-background` is what works in both schemes, because
  // both tokens flip together. A literal color on either side inverts wrongly
  // in one of them.
  primary:
    "rounded-md bg-link font-medium text-background " +
    `transition-opacity hover:opacity-90 cursor-pointer ${disabledClass}`,

  // Anything that is not the primary action, not destructive and not text-only.
  secondary:
    "rounded-md border border-shelf-plank text-shelf-text " +
    `hover:bg-shelf-input transition-colors cursor-pointer ${disabledClass}`,

  // Shelf tokens, not red-600/red-400: this renders on the account page's light
  // shelf AND on the detail card's dark scrim, and a `dark:` pairing cannot
  // tell those apart.
  //
  // Surface and text are tokens because they have to differ per surface. On a
  // solid shelf this is an outline: transparent behind red text. On the detail
  // card it fills with translucent red and flips to white text, because that
  // card's backdrop is the game's own cover art and red text on an unknown
  // color cannot be made to work. See video-games.css for the measurements.
  //
  // So red DOES fill, on that one surface. It is still never the accent fill,
  // which is the thing that would make it read as the default action next to
  // Cancel; a red button does not.
  //
  // The border is a token for the same reason: it is the only thing giving
  // this button a shape on a solid shelf, and it is transparent on the card,
  // where the fill already does that and an outline only drew the eye.
  danger:
    "rounded-md border border-shelf-danger-border bg-shelf-danger-surface text-shelf-danger-text " +
    `hover:bg-shelf-danger-tint transition-colors cursor-pointer ${disabledClass}`,

  // Underlined rather than bordered, so a secondary action inside a form
  // ("Clear rating", "Back to search") reads as link-like without competing
  // with the real buttons. Text-only, so it ignores `size`.
  ghost:
    "text-shelf-text-muted underline underline-offset-2 " +
    "hover:text-shelf-text transition-colors cursor-pointer disabled:opacity-50",

  // Borderless, tinting on hover. The library header's actions and the header
  // menu's rows: chrome that has to stay quiet next to the shelves but still
  // highlight amber like every other interactive thing in the library.
  subtle:
    "rounded-md text-shelf-text-muted hover:bg-shelf-input hover:text-link " +
    `transition-colors duration-150 cursor-pointer ${disabledClass}`,
};

// Ghost has no box, so `size` can only mean its text size.
const ghostSizeClass: Record<ButtonSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  none: "",
};

export function buttonClasses(variant: ButtonVariant, size: ButtonSize): string {
  const sizes = variant === "ghost" ? ghostSizeClass : sizeClass;
  return `${variantClass[variant]} ${sizes[size]}`.trim();
}

// A pressed pill in a "pick one of these" group: the play choices, the rating
// letters. Selected takes accent border and accent text, NEVER the primary
// fill, because a selected toggle is a state rather than the surface's primary
// action, and the fill belongs to Save.
export function toggleClasses(active: boolean): string {
  return active
    ? "border-link bg-shelf-input font-medium text-link"
    : "border-shelf-plank text-shelf-text hover:bg-shelf-input";
}

// One row inside the library header's menu (LibraryHeaderMenu): Back to my
// library, Suggestion/Issue?, Account, Sign in / Sign out. Behind <MenuItem>,
// which is what makes a mix of <a>, next/link and <button> read as one list.
//
// No underline, unlike an inline text link: these are stacked rows in a panel,
// where the row itself is the affordance and four underlines would be noise.
// Hover tints the whole row instead.
//
// Shelf tokens, not the global ones: this sits on the library's own background
// (.shelf-theme), where text-subtle would be low-contrast. Both tokens carry
// light and dark values.
//
// Amber on hover, matching the view tabs, the Add game / Stats buttons and the
// follow-count links, so every interactive element in the library highlights
// the same way.
//
// text-left because a <button> centers its text by default and the anchors
// beside it do not; block + w-full so the whole row is the target, not just
// the glyphs.
//
// cursor-pointer is not redundant: Tailwind v4's preflight sets buttons to
// cursor: default, so "Sign out" would otherwise show an arrow while the
// "Account" link above it shows a hand.
export const menuItemClass =
  "block w-full whitespace-nowrap rounded-md px-3 py-2 text-left text-sm " +
  "text-shelf-text-muted hover:bg-shelf-input hover:text-link cursor-pointer " +
  "transition-colors duration-150";
