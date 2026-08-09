// Shared Tailwind class strings for owner-edit form controls, so the shelf
// input tokens (background, border, focus ring) live in one place instead of
// being re-declared per modal.

// The shelf-input token set, sizing excluded. Everything that renders a field
// composes from this, so a token change lands everywhere at once — including
// the focus ring, which one hand-rolled copy had quietly dropped.
//
// `text-base sm:text-sm` is a mobile Safari workaround, not a design choice.
// iOS zooms the whole page in when a form control smaller than 16px takes
// focus, and it does not zoom back out — so the layout ends up genuinely wider
// than the window and pans in both axes for the rest of the session. 16px on
// phones is the documented way to opt out; the alternative, `maximum-scale=1`
// in the viewport meta, disables pinch-zoom for everyone and is an
// accessibility regression. Above the `sm` breakpoint (a pointer device, where
// no zoom happens) it goes back to 14px so nothing about the desktop layout
// changes.
export const fieldClass =
  "bg-shelf-input border border-shelf-input-border text-shelf-input-text text-base sm:text-sm rounded " +
  "focus:outline-none focus:ring-1 focus:ring-shelf-input-ring";

// Modal fields: full width, snug padding.
export const inputClass = `${fieldClass} w-full px-2 py-1.5`;

// Filter bar fields: sit inline in a row, so they size to content with roomier
// horizontal padding.
export const filterFieldClass = `${fieldClass} px-3 py-1.5`;

// Selects get cursor-pointer on top; text inputs don't need it.
export const filterSelectClass = `${filterFieldClass} cursor-pointer`;

// min-w-0: these are flex items, and a flex item's default `min-width: auto`
// refuses to shrink below its content's intrinsic width. `input[type="date"]`
// is the one that bites — it carries an intrinsic control width that `w-full`
// does not always beat, so without this the field can push its container wider
// than the dialog and make the whole form pan sideways.
export const labelClass =
  "flex min-w-0 flex-col gap-1 text-[10px] uppercase tracking-wide text-shelf-label";

// ---------------------------------------------------------------------------
// Button recipes
//
// Compose buttons from these rather than writing the classes inline. Each one
// encodes a light/dark pairing, and the repo's rule is that no color may work in
// only one scheme — a copied-and-tweaked literal breaks that rule easily, since
// the tweak is usually made while looking at one scheme.
//
// Call sites keep positional modifiers (`mt-2`, `block`, `w-full`) rather than
// baking them in, so these stay about appearance and the layout stays local.
// ---------------------------------------------------------------------------

// Default modal button: outlined, neutral. Cancel, "Log a past session",
// "Save", and the rest of the non-destructive actions.
export const buttonClass =
  "rounded-md border border-shelf-plank px-3 py-1.5 text-sm text-shelf-text " +
  "hover:bg-shelf-input transition-colors cursor-pointer " +
  "disabled:opacity-50 disabled:cursor-default";

// Text-only affordance for secondary actions inside a form ("Clear rating",
// "Enter manually"). Underlined rather than bordered so it reads as a link-like
// action without competing with the real buttons.
export const ghostButtonClass =
  "text-xs text-shelf-text-muted underline underline-offset-2 " +
  "hover:text-shelf-text transition-colors cursor-pointer disabled:opacity-50";

// The confirm half of a destructive two-step. Outlined in red rather than
// filled: it sits next to a Cancel button, and a filled red button next to a
// neutral one reads as the default action, which this must never be.
export const dangerButtonClass =
  "rounded-md border border-red-600/50 dark:border-red-400/50 px-3 py-1.5 text-sm " +
  "text-red-600 dark:text-red-400 hover:bg-red-600/10 transition-colors cursor-pointer " +
  "disabled:opacity-50 disabled:cursor-default";

// The trigger half of a destructive two-step ("Remove from library"). A quiet
// link, so the dangerous thing is never the most prominent control in a dialog.
export const dangerLinkClass =
  "text-xs text-red-600 dark:text-red-400 underline underline-offset-2 " +
  "hover:opacity-80 transition-opacity cursor-pointer disabled:opacity-50";

// The quiet text links in the library header's viewer-controls cluster: Sign
// in / Sign out (AuthButton) and Account. Shared so the cluster cannot drift
// into two slightly different underlines.
//
// Shelf tokens, not the global ones: this sits on the library's own background
// (.shelf-theme), where text-subtle would be low-contrast. Both tokens carry
// light and dark values.
//
// Amber on hover, matching the view tabs, the Add game / Stats buttons and the
// follow-count links, so every interactive element in the library header and
// tab strip highlights the same way.
//
// cursor-pointer is not redundant: Tailwind v4's preflight sets buttons to
// cursor: default, so "Sign out" would otherwise show an arrow while the
// "Sign in" anchor beside it shows a hand.
export const headerLinkClass =
  "text-sm whitespace-nowrap text-shelf-text-muted hover:text-link cursor-pointer " +
  "underline underline-offset-4 transition-colors duration-150";

// The one filled, high-emphasis button: sign in, sign up, "Add game". `bg-link`
// with `text-background` is the pairing that works in both schemes, because both
// tokens flip together — a literal color on either side would invert wrongly in
// one of them.
//
// Carries no text size: call sites set their own, because the onboarding submit
// is deliberately a step larger than the in-library buttons.
export const accentButtonClass =
  "rounded-md bg-link px-4 py-2 font-medium text-background " +
  "transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50";
