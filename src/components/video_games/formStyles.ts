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
// inert in the add form's column and load-bearing in EditGameModal's
// `flex flex-wrap` row of date labels.
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

// The filled pairing, shared by the two recipes below. `bg-link` with
// `text-background` is what works in both schemes, because both tokens flip
// together — a literal color on either side would invert wrongly in one.
const filledBaseClass =
  "rounded-md bg-link font-medium text-background " +
  "transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50";

// The commit half of a draft-then-save edit: rating, system, wishlist notes,
// logged sessions. Filled rather than outlined because it appears only once
// there are unsaved changes, so it has to read as the thing to press instead of
// as more chrome belonging to the field above it.
//
// The line this draws: filled means "commit a pending draft", outlined means an
// action with nothing pending behind it ("Move to library", "Add to library").
// Two filled buttons can otherwise end up side by side competing, which is what
// keeping the dialog-level actions on `buttonClass` avoids.
export const saveButtonClass = `${filledBaseClass} px-3 py-1.5 text-sm disabled:cursor-default`;

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

// The page-level call to action: sign in, sign up, "Add game". Roomier than
// saveButtonClass, and carries no text size — call sites set their own, because
// the onboarding submit is deliberately a step larger than the in-library ones.
export const accentButtonClass = `${filledBaseClass} px-4 py-2`;
