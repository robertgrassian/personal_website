// Custom hook encapsulating all URL-backed state for the game library.
// Everything read from or written to ?view, ?groupBy, ?sortOrder, ?search,
// ?rating, ?system, ?genre lives here — GameLibrary.tsx consumes the result
// and focuses on rendering.
//
// Naming convention: custom hooks must start with "use" — that's how React's
// linter / runtime identify them for the rules-of-hooks check (a hook can
// only be called inside another hook or a component).

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

// search, system, and genre behave identically across views — same URL keys,
// same string type, same semantics. One shared setter replaces per-view callbacks.
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

  // searchInput is local React state so the input responds instantly to every
  // keystroke; the URL update is debounced (300ms) so we're not firing a
  // router.replace on every character.
  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");

  // "Latest ref" pattern: holds the current searchParams without being a dep
  // of the debounce effect. Without this, every URL change would reset the
  // debounce timer, which is the opposite of what we want.
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }); // intentionally no dep array — runs after every render

  // Sync searchInput when the URL changes externally (e.g. clearFilters).
  useEffect(() => {
    setSearchInput(searchParams.get("search") ?? "");
  }, [searchParams]);

  // Debounced URL update for the search input.
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

  // activeFilters uses live searchInput (pre-debounce) so the shelf updates
  // on every keystroke while the URL catches up asynchronously.
  const activeFilters = useMemo(
    () => ({ ...filters, search: searchInput }),
    [filters, searchInput]
  );
  const activeWishlistFilters = useMemo(
    () => ({ ...wishlistFilters, search: searchInput }),
    [wishlistFilters, searchInput]
  );

  // --- Setters ---

  // router.replace updates the URL without pushing a new history entry.
  // startTransition marks navigation non-urgent so the UI stays responsive.
  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      // Resolve current view from URL (not closure) so defaults are evaluated
      // against the active view even mid-transition.
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

  // setView is its own path — it also strips stale groupBy/sortOrder values
  // that the new view doesn't support. Without this, the URL would keep
  // `?sortOrder=starred-first` after switching from wishlist back to played,
  // even though the played view has no such sort option.
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
