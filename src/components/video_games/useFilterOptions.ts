"use client";

import { useMemo } from "react";
import type { Game, Filters } from "@/lib/games";
import type { WishlistGame, WishlistFilters } from "@/lib/wishlist";
import { collectAvailableGameFilters, collectAvailableWishlistFilters } from "./pipeline";
import { type View, isGameView } from "./libraryConfig";

// Everything the two FilterBars need to populate their dropdowns. Two kinds of
// list per view:
//
//   all*       every value that exists in the data, so the dropdown has options
//   available* the subset that would still yield results given the *other*
//              active filters, so the rest can render disabled
//
// These lived as eight useMemos inside GameLibrary, which also renders a tab
// listing usernames. Filter machinery declared on that component had to opt out
// of itself; here it is one call that returns empties for a view with no
// filters at all.
export type FilterOptions = {
  allSystems: string[];
  allGenres: string[];
  availableRatings: Set<string>;
  availableSystems: Set<string>;
  availableGenres: Set<string>;
};

type UseFilterOptionsArgs = {
  games: Game[];
  wishlist: WishlistGame[];
  // Which set actually gets computed. The others are skipped: only one
  // FilterBar is mounted at a time, so computing both was pure waste — and it
  // was real waste, because activeWishlistFilters carries the shared `search`
  // value and so changed on every keystroke in the played view too.
  view: View;
  activeFilters: Filters;
  activeWishlistFilters: WishlistFilters;
};

// Shared empty values rather than a fresh `[]` / `new Set()` per render, so the
// inactive view's props keep a stable identity across renders.
const NO_OPTIONS: string[] = [];
const NO_VALUES: Set<string> = new Set();

export function useFilterOptions({
  games,
  wishlist,
  view,
  activeFilters,
  activeWishlistFilters,
}: UseFilterOptionsArgs): FilterOptions {
  // null on the Following/Followers tabs, which have no filters at all.
  const gameView = isGameView(view) ? view : null;

  // Depend only on the immutable data props, so typing in the search box never
  // rebuilds these — the full option list does not narrow as you filter, only
  // the "available" subset below does.
  const allSystemsPlayed = useMemo(() => [...new Set(games.map((g) => g.system))].sort(), [games]);
  const allGenresPlayed = useMemo(
    () => [...new Set(games.flatMap((g) => g.genres))].sort(),
    [games]
  );
  const allSystemsWishlist = useMemo(
    () => [...new Set(wishlist.map((w) => w.system))].sort(),
    [wishlist]
  );
  const allGenresWishlist = useMemo(
    () => [...new Set(wishlist.flatMap((w) => w.genres))].sort(),
    [wishlist]
  );

  // One traversal each, and only for the view that is actually mounted.
  const availablePlayed = useMemo(
    () => (gameView === "played" ? collectAvailableGameFilters(games, activeFilters) : null),
    [gameView, games, activeFilters]
  );
  const availableWishlist = useMemo(
    () =>
      gameView === "wishlist"
        ? collectAvailableWishlistFilters(wishlist, activeWishlistFilters)
        : null,
    [gameView, wishlist, activeWishlistFilters]
  );

  if (gameView === "played" && availablePlayed) {
    return {
      allSystems: allSystemsPlayed,
      allGenres: allGenresPlayed,
      availableRatings: availablePlayed.ratings,
      availableSystems: availablePlayed.systems,
      availableGenres: availablePlayed.genres,
    };
  }
  if (gameView === "wishlist" && availableWishlist) {
    return {
      allSystems: allSystemsWishlist,
      allGenres: allGenresWishlist,
      // The wishlist FilterBar has no rating control, so this is never read.
      availableRatings: NO_VALUES,
      availableSystems: availableWishlist.systems,
      availableGenres: availableWishlist.genres,
    };
  }
  return {
    allSystems: NO_OPTIONS,
    allGenres: NO_OPTIONS,
    availableRatings: NO_VALUES,
    availableSystems: NO_VALUES,
    availableGenres: NO_VALUES,
  };
}
