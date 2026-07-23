// Shared Tailwind class strings for owner-edit form controls, so the shelf
// input tokens (background, border, focus ring) live in one place instead of
// being re-declared per modal.

export const inputClass =
  "w-full bg-shelf-input border border-shelf-input-border text-shelf-input-text text-sm rounded " +
  "px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-shelf-input-ring";

export const labelClass =
  "flex flex-col gap-1 text-[10px] uppercase tracking-wide text-shelf-label";
