// All URL-backed state for the game library: ?view, ?groupBy, ?sortOrder,
// ?search, ?rating, ?system, ?genre. Custom hooks must start with "use" so
// React's rules-of-hooks lint/runtime checks apply.

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Filters, RatingFilter } from "@/lib/games";
import { RATINGS, UNRATED_LABEL } from "@/lib/games";
import type { WishlistFilters } from "@/lib/wishlist";
import {
  type View,
  type GameView,
  type GroupBy,
  type SortOrder,
  viewConfig,
  validSortOrderFor,
  parseView,
  VIEW_CONFIG,
  DEFAULT_VIEW,
} from "./libraryConfig";

// Filter keys that behave identically across views — one shared setter.
export type SharedFilterKey = "search" | "system" | "genre";

// Every accepted ?rating value. Derived from RATINGS so adding a rating needs
// no change here.
const VALID_RATING_FILTER: readonly RatingFilter[] = [...RATINGS.map((r) => r.name), UNRATED_LABEL];

// Exported so GameLibrary can hand the whole thing to GameShelves as one prop.
// The alternative was eleven pass-through props, or GameShelves calling the
// hook a second time — which would work, since everything here derives from the
// URL, but would duplicate the parse and hide that the two components are
// reading one piece of state.
export type UrlState = {
  view: View;
  groupBy: GroupBy;
  sortOrder: SortOrder;
  activeFilters: Filters;
  activeWishlistFilters: WishlistFilters;
  validGroupBy: readonly GroupBy[];
  validSortOrder: readonly SortOrder[];
  setView: (value: GameView) => void;
  setGroupBy: (value: GroupBy) => void;
  setSortOrder: (value: SortOrder) => void;
  setSharedFilter: (key: SharedFilterKey, value: string) => void;
  setRating: (value: RatingFilter) => void;
  clearFilters: () => void;
};

export function useGameLibraryUrlState(): UrlState {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /** Write the query string to the URL without navigating.
   *
   *  Native History API rather than `router.replace`. Next patches
   *  pushState/replaceState so `usePathname` and `useSearchParams` still see the
   *  change, but it is not a navigation, so no RSC payload is fetched.
   *
   *  `router.replace` was one round trip per filter interaction: the Router
   *  Cache keys on the full URL, so every distinct `?system=…` was a miss and
   *  refetched the route. Measured at ~100KB carrying all 157 games, for a page
   *  byte-identical to the one already on screen — no route here declares a
   *  `searchParams` prop, so the server render cannot depend on the query
   *  string. Worse, it was on the critical path: `system`/`genre`/`rating` are
   *  read back out of `useSearchParams`, which only updates once the navigation
   *  commits, so a dropdown could not move a card until the server answered.
   *  Search felt faster than the dropdowns only because it reads `searchInput`
   *  directly.
   *
   *  No `{ scroll: false }` equivalent needed: replaceState never scrolls. */
  const replaceUrl = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname]
  );

  // Input responds instantly; URL update is debounced 300ms below.
  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");

  // "Latest ref" pattern: the debounce effect reads current params without
  // re-subscribing on every URL change (which would reset the timer).
  const searchParamsRef = useRef(searchParams);
  // Same pattern for the live input: the setters below rebuild the query string
  // from `searchParams`, whose ?search lags by the debounce, so they need the
  // typed value from somewhere that is not the URL.
  const searchInputRef = useRef(searchInput);
  useEffect(() => {
    searchParamsRef.current = searchParams;
    searchInputRef.current = searchInput;
  }); // no dep array — runs after every render

  // Every ?search value this hook has written and not yet seen echoed back.
  //
  // Still needed after the move to replaceState, but for a much narrower
  // window. The write itself is now synchronous; the echo is not, because it
  // arrives as a re-render and is consumed in an effect. A keystroke landing in
  // that gap leaves `searchInput` newer than the URL, and applying the echo
  // would put the older string back. The gap used to be 300ms plus a server
  // round trip, and this component's renders are heavy enough (deferred
  // filter/group/sort over the whole library) that it is not zero now.
  //
  // Values rather than a count, because a count assumes every push produces
  // exactly one echo, and a render React coalesces away would drain it wrong
  // and start swallowing real navigations forever. Matching on value is
  // self-correcting: at worst a stale entry means one genuine navigation to
  // that exact string is ignored, which leaves the box holding what was typed.
  const pushedSearchValues = useRef<Set<string>>(new Set());

  // Sync local input when the URL changes externally: browser Back, or a link
  // that arrives with its own ?search.
  //
  // The guard is what stops this from eating keystrokes, and it took a real
  // report to find. This hook's own debounced write lands here as an ordinary
  // searchParams change, carrying the value as it stood one debounce ago.
  // Applying it unconditionally overwrote everything typed in the
  // meantime, so a fast typist would watch a character vanish a beat after
  // pressing it -- and the faster the typing, the more often the window was
  // open. So: recognize our own echo, consume it, and leave the input alone,
  // because it has moved on and is the newer truth.
  useEffect(() => {
    const fromUrl = searchParams.get("search") ?? "";
    // delete() answers "was this one of ours?" and consumes it in one step.
    if (pushedSearchValues.current.delete(fromUrl)) return;
    // Nothing we wrote, so a real navigation: Back, Forward, or a link that
    // arrived with its own ?search. It wins, and anything still outstanding is
    // now moot.
    pushedSearchValues.current.clear();
    setSearchInput(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (searchInput === "") {
        params.delete("search");
      } else {
        params.set("search", searchInput);
      }
      pushedSearchValues.current.add(searchInput);
      replaceUrl(params);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, replaceUrl]);

  // --- Derived URL values ---

  const view = parseView(searchParams.get("view"));
  const config = viewConfig(view);

  const rawGroupBy = searchParams.get("groupBy");
  const groupBy: GroupBy = config.validGroupBy.includes(rawGroupBy as GroupBy)
    ? (rawGroupBy as GroupBy)
    : config.defaultGroupBy;

  // Validated against the GROUPING-aware list, not `config.validSortOrder`:
  // the rating sorts drop out under groupBy="rating", and a URL still carrying
  // one has to fall back rather than select an option the menu no longer
  // renders (a <select> whose value matches no <option> shows blank).
  const validSortOrder = validSortOrderFor(view, groupBy);
  const rawSortOrder = searchParams.get("sortOrder");
  const sortOrder: SortOrder = validSortOrder.includes(rawSortOrder as SortOrder)
    ? (rawSortOrder as SortOrder)
    : config.defaultSortOrder;

  // Read as primitives, and key the memos below on those rather than on the
  // searchParams object. Keying on the object made these memos miss on any URL
  // change at all: the debounced ?search landing 300ms after the user stopped
  // typing minted a new object, so the entire downstream pipeline (five
  // "available" sets plus the filter/group/sort pass) re-ran and produced
  // byte-identical results. Changing groupBy or sortOrder, which touch no
  // filter, invalidated them too. Strings compare by value, so both are now
  // cache hits.
  //
  // Validated rather than cast: an unknown ?rating would otherwise match no
  // game and render an empty library, which reads as a broken page rather than
  // as a bad URL. Possible here because the valid set is static (RATINGS).
  // ?system and ?genre below have the same failure mode and are still
  // unvalidated — their valid sets are data-dependent, so the check would have
  // to live where the games are, not here.
  const rawRating = searchParams.get("rating");
  const rating: RatingFilter = VALID_RATING_FILTER.includes(rawRating as RatingFilter)
    ? (rawRating as RatingFilter)
    : "";
  const system = searchParams.get("system") ?? "";
  const genre = searchParams.get("genre") ?? "";

  // Use live searchInput (pre-debounce) so shelves update per keystroke. The
  // URL's own ?search is deliberately not read here: it lags by the debounce,
  // and these are the only filter objects anything consumes.
  const activeFilters = useMemo<Filters>(
    () => ({ search: searchInput, rating, system, genre }),
    [searchInput, rating, system, genre]
  );
  const activeWishlistFilters = useMemo<WishlistFilters>(
    () => ({ search: searchInput, system, genre }),
    [searchInput, system, genre]
  );

  // --- Setters ---

  /** Query params for a replace: the current URL, but with ?search taken from
   *  the live input rather than the URL's lagging copy.
   *
   *  Every setter here rebuilds the whole query string, so each one is a chance
   *  to write a stale ?search back. Typing "chrono" and changing the rating
   *  dropdown 100ms later would otherwise replace the URL with the ?search from
   *  before the word was typed, and the sync effect above would then apply it to
   *  the input. Carrying the live value makes each of these a no-op for search,
   *  and registering the push means the echo is recognized rather than applied. */
  const paramsWithLiveSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    const live = searchInputRef.current;
    if (live === "") {
      params.delete("search");
    } else {
      params.set("search", live);
    }
    pushedSearchValues.current.add(live);
    return params;
  }, [searchParams]);

  // replaceState, so filter changes leave no history entry to Back through.
  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = paramsWithLiveSearch();
      // Read view from the URL (not closure) so defaults resolve against the
      // live value, even mid-transition.
      const currentConfig = viewConfig(parseView(params.get("view")));
      const isDefault =
        value === "" ||
        (key === "groupBy" && value === currentConfig.defaultGroupBy) ||
        (key === "sortOrder" && value === currentConfig.defaultSortOrder) ||
        (key === "view" && value === DEFAULT_VIEW);
      if (isDefault) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      replaceUrl(params);
    },
    [paramsWithLiveSearch, replaceUrl]
  );

  // setView also strips groupBy/sortOrder values the new view doesn't support,
  // so e.g. `?sortOrder=added-newest` doesn't leak from wishlist to played.
  //
  // GameView, not View: the tab strip is the only caller and renders only game
  // tabs. The people views are reached from the header counts, whose links build
  // a fresh `?view=` and so drop the filter params by construction rather than
  // needing to clear them here.
  const setView = useCallback(
    (value: GameView) => {
      const params = paramsWithLiveSearch();
      if (value === DEFAULT_VIEW) {
        params.delete("view");
      } else {
        params.set("view", value);
      }
      const newConfig = VIEW_CONFIG[value];
      const currentGroupBy = params.get("groupBy");
      if (currentGroupBy && !newConfig.validGroupBy.includes(currentGroupBy as GroupBy)) {
        params.delete("groupBy");
      }
      const currentSortOrder = params.get("sortOrder");
      if (currentSortOrder && !newConfig.validSortOrder.includes(currentSortOrder as SortOrder)) {
        params.delete("sortOrder");
      }
      replaceUrl(params);
    },
    [paramsWithLiveSearch, replaceUrl]
  );
  // Not updateParam, because changing the grouping can invalidate the sort:
  // grouping by rating withdraws the rating sorts. Left in the URL, the stale
  // ?sortOrder would sit there inert and then spring back into effect the
  // moment the grouping changed again — the same leak setView cleans up when
  // switching views, one param over.
  const setGroupBy = useCallback(
    (value: GroupBy) => {
      const params = paramsWithLiveSearch();
      const currentView = parseView(params.get("view"));
      if (value === viewConfig(currentView).defaultGroupBy) {
        params.delete("groupBy");
      } else {
        params.set("groupBy", value);
      }
      const currentSortOrder = params.get("sortOrder");
      const stillValid = validSortOrderFor(currentView, value);
      if (currentSortOrder && !stillValid.includes(currentSortOrder as SortOrder)) {
        params.delete("sortOrder");
      }
      replaceUrl(params);
    },
    [paramsWithLiveSearch, replaceUrl]
  );
  const setSortOrder = useCallback(
    (value: SortOrder) => updateParam("sortOrder", value),
    [updateParam]
  );

  const setSharedFilter = useCallback(
    (key: SharedFilterKey, value: string) => {
      if (key === "search") {
        setSearchInput(value);
      } else {
        updateParam(key, value);
      }
    },
    [updateParam]
  );

  const setRating = useCallback(
    (value: RatingFilter) => updateParam("rating", value),
    [updateParam]
  );

  // Clears filter params; view preferences (groupBy, sortOrder, view) are preserved.
  const clearFilters = useCallback(() => {
    setSearchInput("");
    const params = new URLSearchParams(searchParams.toString());
    // Not paramsWithLiveSearch: this is the one setter that means to discard
    // the live value, so it registers the empty push itself.
    pushedSearchValues.current.add("");
    params.delete("search");
    params.delete("rating");
    params.delete("system");
    params.delete("genre");
    replaceUrl(params);
  }, [searchParams, replaceUrl]);

  return {
    view,
    groupBy,
    sortOrder,
    activeFilters,
    activeWishlistFilters,
    validGroupBy: config.validGroupBy,
    validSortOrder,
    setView,
    setGroupBy,
    setSortOrder,
    setSharedFilter,
    setRating,
    clearFilters,
  };
}
