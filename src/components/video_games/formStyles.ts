// Shared Tailwind class strings for owner-edit form FIELDS, so the shelf input
// tokens (background, border, focus ring) live in one place instead of being
// re-declared per modal.
//
// Buttons used to live here too. They are components now, in
// src/components/ui/, because they are site-wide and this module is not.

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
