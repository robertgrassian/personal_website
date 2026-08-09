"use client";

import { useMemo } from "react";
import type { Game, Filters } from "@/lib/games";
import type { WishlistGame, WishlistFilters } from "@/lib/wishlist";
import { collectAvailableGameFilters, collectAvailableWishlistFilters } from "./pipeline";
import type { GameView } from "./libraryConfig";

// Everything the two FilterBars need to populate their dropdowns. Two kinds of
// list per view:
//
//   all*       every value that exists in the data, so the dropdown has options
//   available* the subset that would still yield results given the *other*
//              active filters, so the rest can render disabled
//
// These lived as eight useMemos inside GameLibrary, which also renders a tab
// listing usernames — filter machinery declared on a component that had to opt
// out of it. GameShelves, which does nothing else, is the only caller.
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
  // GameView, not View: the people tabs have no filters, and GameShelves is
  // only mounted on a shelf view, so there is no third case to answer for.
  //
  // This also decides which set actually gets computed. Doing both was pure
  // waste — and real waste, because activeWishlistFilters carries the shared
  // `search` value and so changed on every keystroke in the played view too.
  view: GameView;
  activeFilters: Filters;
  activeWishlistFilters: WishlistFilters;
};

// One shared empty set rather than a fresh `new Set()` per render, so the
// wishlist view's unused ratings prop keeps a stable identity.
const NO_VALUES: Set<string> = new Set();

export function useFilterOptions({
  games,
  wishlist,
  view,
  activeFilters,
  activeWishlistFilters,
}: UseFilterOptionsArgs): FilterOptions {
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
    () => (view === "played" ? collectAvailableGameFilters(games, activeFilters) : null),
    [view, games, activeFilters]
  );
  const availableWishlist = useMemo(
    () =>
      view === "wishlist" ? collectAvailableWishlistFilters(wishlist, activeWishlistFilters) : null,
    [view, wishlist, activeWishlistFilters]
  );

  if (view === "played") {
    return {
      allSystems: allSystemsPlayed,
      allGenres: allGenresPlayed,
      // Non-null whenever view is "played" — same condition as the memo.
      availableRatings: availablePlayed?.ratings ?? NO_VALUES,
      availableSystems: availablePlayed?.systems ?? NO_VALUES,
      availableGenres: availablePlayed?.genres ?? NO_VALUES,
    };
  }
  return {
    allSystems: allSystemsWishlist,
    allGenres: allGenresWishlist,
    // The wishlist FilterBar has no rating control, so this is never read.
    availableRatings: NO_VALUES,
    availableSystems: availableWishlist?.systems ?? NO_VALUES,
    availableGenres: availableWishlist?.genres ?? NO_VALUES,
  };
}
