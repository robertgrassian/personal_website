// All URL-backed state for the game library: ?view, ?groupBy, ?sortOrder,
// ?search, ?rating, ?system, ?genre. Custom hooks must start with "use" so
// React's rules-of-hooks lint/runtime checks apply.

import { useState, useEffect, useRef, useTransition, useMemo, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Filters, Rating } from "@/lib/games";
import type { WishlistFilters } from "@/lib/wishlist";
import {
  type View,
  type GroupBy,
  type SortOrder,
  VIEW_CONFIG,
  VALID_VIEW,
  DEFAULT_VIEW,
} from "./libraryConfig";

// Filter keys that behave identically across views — one shared setter.
export type SharedFilterKey = "search" | "system" | "genre";

type UrlState = {
  view: View;
  groupBy: GroupBy;
  sortOrder: SortOrder;
  filters: Filters;
  wishlistFilters: WishlistFilters;
  activeFilters: Filters;
  activeWishlistFilters: WishlistFilters;
  validGroupBy: readonly GroupBy[];
  validSortOrder: readonly SortOrder[];
  setView: (value: View) => void;
  setGroupBy: (value: GroupBy) => void;
  setSortOrder: (value: SortOrder) => void;
  setSharedFilter: (key: SharedFilterKey, value: string) => void;
  setRating: (value: Rating | "") => void;
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

  const rawView = searchParams.get("view");
  const view: View = VALID_VIEW.includes(rawView as View) ? (rawView as View) : DEFAULT_VIEW;
  const config = VIEW_CONFIG[view];

  const rawGroupBy = searchParams.get("groupBy");
  const groupBy: GroupBy = config.validGroupBy.includes(rawGroupBy as GroupBy)
    ? (rawGroupBy as GroupBy)
    : config.defaultGroupBy;

  const rawSortOrder = searchParams.get("sortOrder");
  const sortOrder: SortOrder = config.validSortOrder.includes(rawSortOrder as SortOrder)
    ? (rawSortOrder as SortOrder)
    : config.defaultSortOrder;

  const filters = useMemo<Filters>(
    () => ({
      search: searchParams.get("search") ?? "",
      rating: (searchParams.get("rating") ?? "") as Rating | "",
      system: searchParams.get("system") ?? "",
      genre: searchParams.get("genre") ?? "",
    }),
    [searchParams]
  );

  const wishlistFilters = useMemo<WishlistFilters>(
    () => ({
      search: searchParams.get("search") ?? "",
      system: searchParams.get("system") ?? "",
      genre: searchParams.get("genre") ?? "",
    }),
    [searchParams]
  );

  // Use live searchInput (pre-debounce) so shelves update per keystroke.
  const activeFilters = useMemo(
    () => ({ ...filters, search: searchInput }),
    [filters, searchInput]
  );
  const activeWishlistFilters = useMemo(
    () => ({ ...wishlistFilters, search: searchInput }),
    [wishlistFilters, searchInput]
  );

  // --- Setters ---

  // router.replace: no history entry. startTransition: keeps UI responsive.
  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      // Read view from the URL (not closure) so defaults resolve against the
      // live value, even mid-transition.
      const rawViewInUrl = params.get("view");
      const currentView: View = VALID_VIEW.includes(rawViewInUrl as View)
        ? (rawViewInUrl as View)
        : DEFAULT_VIEW;
      const currentConfig = VIEW_CONFIG[currentView];
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
  // so e.g. `?sortOrder=starred-first` doesn't leak from wishlist to played.
  const setView = useCallback(
    (value: View) => {
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
    (value: Rating | "") => updateParam("rating", value),
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
    filters,
    wishlistFilters,
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
