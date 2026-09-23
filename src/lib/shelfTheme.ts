// Which shelf the library wears. Change ACTIVE_SHELF_THEME and everything
// follows: the surface a game sits on, the page ground behind it, and whether
// a group of games is a piece of furniture or a plank.
//
// A constant rather than a value read per user, for the same reason
// ACTIVE_ACCENT is one: the eventual "let a user style their library" feature
// needs something to set. Swap this for a value read per request and the only
// other change is where LibraryPage puts the attribute.
//
// The CSS side of each theme lives in shelf-themes.css, keyed by the same names
// on [data-shelf-theme]; the component side is SHELF_GROUPS in
// components/video_games/shelves. All three must move together, which is why
// the names are here rather than spelled out at each call site.

export const SHELF_THEMES = {
  // Walnut bookcases, one per group, a board per row of games, in perspective.
  "built-in": { label: "Built-in" },
  // The shelf this site shipped for a year: one flat plank per group, games in
  // a wrapping grid, no furniture around it. Kept as a real theme rather than
  // as history, because it is the better answer on a small screen and it is
  // what the customization feature will offer as the alternative.
  plain: { label: "Plain" },
} as const;

export type ShelfThemeName = keyof typeof SHELF_THEMES;

export const ACTIVE_SHELF_THEME: ShelfThemeName = "built-in";
