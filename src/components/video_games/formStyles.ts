// Shared Tailwind class strings for owner-edit form controls, so the shelf
// input tokens (background, border, focus ring) live in one place instead of
// being re-declared per modal.

// The shelf-input token set, sizing excluded. Everything that renders a field
// composes from this, so a token change lands everywhere at once — including
// the focus ring, which one hand-rolled copy had quietly dropped.
//
// 16px on touch, 14px with a mouse. Mobile Safari zooms the page in when a
// control under 16px takes focus and does not zoom back out, which is what
// leaves the layout wider than the window and panning in both axes.
// `pointer-fine`, not a breakpoint: it is a device capability, and an iPad is
// wider than `sm` while still zooming. The alternative fix, `maximum-scale=1`
// in the viewport meta, disables pinch-zoom for everyone.
export const fieldClass =
  "bg-shelf-input border border-shelf-input-border text-shelf-input-text text-base pointer-fine:text-sm rounded " +
  "focus:outline-none focus:ring-1 focus:ring-shelf-input-ring";

// Modal fields: full width, snug padding.
export const inputClass = `${fieldClass} w-full px-2 py-1.5`;

// Filter bar fields: sit inline in a row, so they size to content with roomier
// horizontal padding.
export const filterFieldClass = `${fieldClass} px-3 py-1.5`;

// Selects get cursor-pointer on top; text inputs don't need it.
export const filterSelectClass = `${filterFieldClass} cursor-pointer`;

// min-w-0: a flex item's automatic minimum size refuses to shrink below its
// content, and `input[type="date"]` carries an intrinsic control width that
// `w-full` does not always beat. It applies on the MAIN axis only, so this is
// inert in the add form's column and load-bearing in GameEditFields'
// `flex flex-wrap` row of date labels.
export const labelClass =
  "flex min-w-0 flex-col gap-1 text-[10px] uppercase tracking-wide text-shelf-label";

// ---------------------------------------------------------------------------
// Button recipes
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
// PlayedFields and RatingPicker.
//
// This replaced an earlier rule where filled meant "commits a pending draft".
// That one was followed exactly and still read as inconsistent: it left the add
// dialog's own primary action outlined, and it paired a tinted destructive
// trigger with an outlined confirm in the same interaction.
//
// Each recipe encodes a light/dark pairing, and the repo's rule is that no
// color may work in only one scheme. A copied-and-tweaked literal breaks that
// easily, since the tweak is usually made while looking at one scheme.
//
// Call sites keep positional modifiers (`mt-2`, `block`, `w-full`) rather than
// baking them in, so these stay about appearance and the layout stays local.
// ---------------------------------------------------------------------------

// The default: outlined, neutral. Anything that is not the primary action, not
// destructive and not text-only. Cancel, "Log a past session", "Played?".
export const buttonClass =
  "rounded-md border border-shelf-plank px-3 py-1.5 text-sm text-shelf-text " +
  "hover:bg-shelf-input transition-colors cursor-pointer " +
  "disabled:opacity-50 disabled:cursor-default";

// The filled pairing, shared by the two primaries below. `bg-link` with
// `text-background` is what works in both schemes, because both tokens flip
// together — a literal color on either side would invert wrongly in one.
const filledBaseClass =
  "rounded-md bg-link font-medium text-background " +
  "transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50";

// The one filled button on a surface: Save, "Add to library", Follow.
export const primaryButtonClass = `${filledBaseClass} px-3 py-1.5 text-sm disabled:cursor-default`;

// The same primary, roomier, for a page-level call to action: sign in, sign up,
// "Add your first game". Carries no text size, because call sites set their
// own — onboarding's submit is deliberately a step larger than the in-library
// ones.
export const primaryLargeButtonClass = `${filledBaseClass} px-4 py-2`;

// Text-only affordance for secondary actions inside a form ("Clear rating",
// "Enter manually"). Underlined rather than bordered so it reads as a link-like
// action without competing with the real buttons.
export const ghostButtonClass =
  "text-xs text-shelf-text-muted underline underline-offset-2 " +
  "hover:text-shelf-text transition-colors cursor-pointer disabled:opacity-50";

// Destructive, for BOTH halves of a two-step: the trigger and the confirm it
// opens. One recipe rather than two, so the pair cannot disagree with itself,
// which is what a tinted trigger above an outlined confirm was doing.
//
// Shelf tokens, not red-600/red-400: this renders on the account page's light
// shelf AND on the card's dark scrim, and a `dark:` pairing cannot tell those
// apart.
export const dangerButtonClass =
  "rounded-md border border-shelf-danger/60 px-3 py-1.5 text-sm " +
  "text-shelf-danger hover:bg-shelf-danger-tint transition-colors cursor-pointer " +
  "disabled:opacity-50 disabled:cursor-default";

// One row inside the library header's menu (LibraryHeaderMenu): Back to my
// library, Suggestion/Issue?, Account, Sign in / Sign out. Shared so a mix of
// <a>, next/link and <button> reads as one list.
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
export const headerMenuItemClass =
  "block w-full whitespace-nowrap rounded-md px-3 py-2 text-left text-sm " +
  "text-shelf-text-muted hover:bg-shelf-input hover:text-link cursor-pointer " +
  "transition-colors duration-150";
