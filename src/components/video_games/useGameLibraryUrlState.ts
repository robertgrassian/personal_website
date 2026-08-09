// All URL-backed state for the game library: ?view, ?groupBy, ?sortOrder,
// ?search, ?rating, ?system, ?genre. Custom hooks must start with "use" so
// React's rules-of-hooks lint/runtime checks apply.

import { useState, useEffect, useRef, useTransition, useMemo, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Filters, RatingFilter } from "@/lib/games";
import { RATINGS, UNRATED_LABEL } from "@/lib/games";
import type { WishlistFilters } from "@/lib/wishlist";
import {
  type View,
  type GameView,
  type GroupBy,
  type SortOrder,
  viewConfig,
  parseView,
  VIEW_CONFIG,
  DEFAULT_VIEW,
} from "./libraryConfig";

// Filter keys that behave identically across views — one shared setter.
export type SharedFilterKey = "search" | "system" | "genre";

// Every accepted ?rating value. Derived from RATINGS so adding a rating needs
// no change here.
const VALID_RATING_FILTER: readonly RatingFilter[] = [...RATINGS.map((r) => r.name), UNRATED_LABEL];

type UrlState = {
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Input responds instantly; URL update is debounced 300ms below.
  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");

  // "Latest ref" pattern: the debounce effect reads current params without
  // re-subscribing on every URL change (which would reset the timer).
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }); // no dep array — runs after every render

  // Sync local input when the URL changes externally (e.g. clearFilters).
  useEffect(() => {
    setSearchInput(searchParams.get("search") ?? "");
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (searchInput === "") {
        params.delete("search");
      } else {
        params.set("search", searchInput);
      }
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, pathname, router]);

  // --- Derived URL values ---

  const view = parseView(searchParams.get("view"));
  const config = viewConfig(view);

  const rawGroupBy = searchParams.get("groupBy");
  const groupBy: GroupBy = config.validGroupBy.includes(rawGroupBy as GroupBy)
    ? (rawGroupBy as GroupBy)
    : config.defaultGroupBy;

  const rawSortOrder = searchParams.get("sortOrder");
  const sortOrder: SortOrder = config.validSortOrder.includes(rawSortOrder as SortOrder)
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

  // router.replace: no history entry. startTransition: keeps UI responsive.
  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
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
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [searchParams, pathname, router]
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
      const params = new URLSearchParams(searchParams.toString());
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
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [searchParams, pathname, router]
  );
  const setGroupBy = useCallback((value: GroupBy) => updateParam("groupBy", value), [updateParam]);
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
    params.delete("search");
    params.delete("rating");
    params.delete("system");
    params.delete("genre");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }, [searchParams, pathname, router]);

  return {
    view,
    groupBy,
    sortOrder,
    activeFilters,
    activeWishlistFilters,
    validGroupBy: config.validGroupBy,
    validSortOrder: config.validSortOrder,
    setView,
    setGroupBy,
    setSortOrder,
    setSharedFilter,
    setRating,
    clearFilters,
  };
}
