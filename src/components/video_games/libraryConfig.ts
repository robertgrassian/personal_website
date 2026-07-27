// View/group/sort types and per-view config. Shared by the URL-state hook,
// the pipeline helpers, and the FilterBar.

export type View = "played" | "wishlist";

// Unions across BOTH views. Per-view valid subsets live in VIEW_CONFIG below.
// Note there is no "starred" value: on the wishlist, starred items are always
// split into their own leading shelf, so it isn't a grouping you can pick.
export type GroupBy = "none" | "system" | "rating" | "genre" | "decade";

export type SortOrder =
  | "name-asc"
  | "name-desc"
  | "release-oldest"
  | "release-newest"
  | "played-newest"
  | "played-oldest"
  | "added-newest"
  | "added-oldest";

// All view-specific data in one Record — adding a view = one object literal.
export type ViewConfig = {
  label: string;
  defaultGroupBy: GroupBy;
  defaultSortOrder: SortOrder;
  validGroupBy: readonly GroupBy[];
  validSortOrder: readonly SortOrder[];
};

export const VIEW_CONFIG: Record<View, ViewConfig> = {
  played: {
    label: "Played",
    defaultGroupBy: "rating",
    defaultSortOrder: "name-asc",
    validGroupBy: ["none", "system", "rating", "genre", "decade"],
    validSortOrder: [
      "name-asc",
      "name-desc",
      "release-oldest",
      "release-newest",
      "played-newest",
      "played-oldest",
    ],
  },
  wishlist: {
    label: "Want to Play",
    defaultGroupBy: "system",
    defaultSortOrder: "name-asc",
    validGroupBy: ["none", "system", "genre", "decade"],
    validSortOrder: [
      "name-asc",
      "name-desc",
      "release-oldest",
      "release-newest",
      "added-newest",
      "added-oldest",
    ],
  },
};

export const VALID_VIEW: readonly View[] = ["played", "wishlist"];
export const DEFAULT_VIEW: View = "played";
