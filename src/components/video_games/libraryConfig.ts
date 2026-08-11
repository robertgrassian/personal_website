// View/group/sort types and per-view config. Shared by the URL-state hook,
// the pipeline helpers, and the FilterBar.

// Two kinds of tab share one strip and one ?view param, but they show entirely
// different things: game shelves vs lists of people. Splitting the union keeps
// group/sort config (below) meaningless-free for the people tabs, and — the
// real reason — makes every VIEW_CONFIG lookup a type error until it is
// guarded. GameLibrary branches on `view === "played"` in a dozen places where
// the else-branch means "wishlist"; without the split, a people tab would
// silently fall into those branches and render the wishlist pipeline.
export type GameView = "played" | "wishlist";
export type PeopleView = "following" | "followers";
export type View = GameView | PeopleView;

export function isGameView(view: View): view is GameView {
  return view === "played" || view === "wishlist";
}

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
  | "added-oldest"
  | "rating-best"
  | "rating-worst";

// Sorts that read a game's rating, and so are meaningless once the shelves are
// already one-rating-each. Kept as a set here rather than a `startsWith`
// check so a future sort named "rating-something-else" has to opt in.
const RATING_SORT_ORDERS: readonly SortOrder[] = ["rating-best", "rating-worst"];

// Tab labels for every view, people tabs included — the strip renders from
// this, so it is the one place all four appear together.
export const VIEW_LABEL: Record<View, string> = {
  played: "Played",
  wishlist: "Want to Play",
  following: "Following",
  followers: "Followers",
};

// Filter/group/sort config, which only games have. Keyed by GameView so a
// people tab cannot be given a meaningless default grouping.
export type ViewConfig = {
  defaultGroupBy: GroupBy;
  defaultSortOrder: SortOrder;
  validGroupBy: readonly GroupBy[];
  validSortOrder: readonly SortOrder[];
};

export const VIEW_CONFIG: Record<GameView, ViewConfig> = {
  played: {
    defaultGroupBy: "rating",
    defaultSortOrder: "name-asc",
    validGroupBy: ["none", "system", "rating", "genre", "decade"],
    validSortOrder: [
      "name-asc",
      "name-desc",
      "rating-best",
      "rating-worst",
      "release-oldest",
      "release-newest",
      "played-newest",
      "played-oldest",
    ],
  },
  wishlist: {
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

// Every value ?view= accepts. Broader than what the tab strip renders: the
// people views are reached from the follow counts in the profile header, since
// they list people rather than slicing the same collection of games. Both still
// live in ?view because only one of them can be on screen at a time.
export const VALID_VIEW: readonly View[] = ["played", "wishlist", "following", "followers"];

// What the tab strip itself renders, in order.
export const VALID_GAME_VIEW: readonly GameView[] = ["played", "wishlist"];
export const DEFAULT_VIEW: GameView = "played";

// The config to fall back on for a people view, which has none of its own.
// Group/sort params are stripped from the URL when switching to a people tab,
// so this only ever decides what a stale param validates against.
export function viewConfig(view: View): ViewConfig {
  return VIEW_CONFIG[isGameView(view) ? view : DEFAULT_VIEW];
}

/** The sort orders actually offerable for a view, given how it is grouped.
 *
 *  This is the one place `validSortOrder` is narrowed by something other than
 *  the view, and the reason is grouping by rating: every shelf then holds a
 *  single rating, so sorting by rating inside them can only ever be a no-op.
 *  Withheld rather than offered and ignored — an option that visibly does
 *  nothing reads as a bug.
 *
 *  Returns the config array itself in the common case, so the identity is
 *  stable across renders and only the narrowed path allocates. */
export function validSortOrderFor(view: View, groupBy: GroupBy): readonly SortOrder[] {
  const { validSortOrder } = viewConfig(view);
  if (groupBy !== "rating") return validSortOrder;
  return validSortOrder.filter((sort) => !RATING_SORT_ORDERS.includes(sort));
}

// Validate a raw ?view value. Lives here with VALID_VIEW and DEFAULT_VIEW
// because four separate places read that param — the URL-state hook (twice),
// the library count, and the follow-count links — and each used to repeat the
// check with its own `as View` casts. Those casts are what this contains: the
// assertion happens once, inside the guard that justifies it.
export function parseView(raw: string | null): View {
  return VALID_VIEW.includes(raw as View) ? (raw as View) : DEFAULT_VIEW;
}
