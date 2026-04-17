// View/group/sort type definitions and per-view configuration for the game library.
// Split out of GameLibrary.tsx so the URL-state hook, the pipeline helpers, and
// the FilterBar can all share the same schema without circular imports.

export type View = "played" | "wishlist";

// GroupBy and SortOrder are single unions covering BOTH views. Not every value
// is valid in every view — VIEW_CONFIG[view].validGroupBy / validSortOrder hold
// the per-view subsets used for URL validation and dropdown options.
export type GroupBy = "none" | "system" | "rating" | "starred" | "genre" | "decade";

export type SortOrder =
  | "name-asc"
  | "name-desc"
  | "release-oldest"
  | "release-newest"
  | "played-newest"
  | "played-oldest"
  | "added-newest"
  | "added-oldest"
  | "starred-first";

// All view-specific data colocated in one Record. Adding a new view means
// filling one object (compile-time complete) rather than updating four maps.
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
    defaultGroupBy: "starred",
    defaultSortOrder: "name-asc",
    validGroupBy: ["none", "system", "starred", "genre", "decade"],
    validSortOrder: [
      "name-asc",
      "name-desc",
      "release-oldest",
      "release-newest",
      "added-newest",
      "added-oldest",
      "starred-first",
    ],
  },
};

export const VALID_VIEW: readonly View[] = ["played", "wishlist"];
export const DEFAULT_VIEW: View = "played";
