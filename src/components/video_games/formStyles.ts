// Shared Tailwind class strings for owner-edit form controls, so the shelf
// input tokens (background, border, focus ring) live in one place instead of
// being re-declared per modal.

// The shelf-input token set, sizing excluded. Everything that renders a field
// composes from this, so a token change lands everywhere at once — including
// the focus ring, which one hand-rolled copy had quietly dropped.
export const fieldClass =
  "bg-shelf-input border border-shelf-input-border text-shelf-input-text text-sm rounded " +
  "focus:outline-none focus:ring-1 focus:ring-shelf-input-ring";

// Modal fields: full width, snug padding.
export const inputClass = `${fieldClass} w-full px-2 py-1.5`;

// Filter bar fields: sit inline in a row, so they size to content with roomier
// horizontal padding.
export const filterFieldClass = `${fieldClass} px-3 py-1.5`;

// Selects get cursor-pointer on top; text inputs don't need it.
export const filterSelectClass = `${filterFieldClass} cursor-pointer`;

export const labelClass =
  "flex flex-col gap-1 text-[10px] uppercase tracking-wide text-shelf-label";

// ---------------------------------------------------------------------------
// Button recipes
//
// Four shapes, previously re-typed as long literals at ~20 call sites. Naming
// them is not only about length: every one of these encodes a light/dark
// pairing, and the repo's rule is that no color may work in only one scheme.
// A copied-and-tweaked literal is exactly how that rule gets broken, because
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

// The one filled, high-emphasis button: sign in, sign up, "Add game". `bg-link`
// with `text-background` is the pairing that works in both schemes, because
// both tokens flip together — a literal color on either side would invert
// wrongly in one of them. That pairing is the reason this constant exists.
//
// Carries no text size on purpose. The onboarding submit is deliberately a step
// larger than the in-library buttons, and folding `text-sm` in here would either
// shrink it silently or leave it as a fifth hand-written copy of the color
// pairing — which is the failure mode this is meant to prevent. Each call site
// states its own size.
export const accentButtonClass =
  "rounded-md bg-link px-4 py-2 font-medium text-background " +
  "transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50";
