// Pure filter/group/sort helpers. No React, no hooks.
//
// Each pipeline calls a shared helper for BaseGame cases; the helper returns
// null for view-specific keys so the caller handles them. Unrecognized values
// warn and fall back to name-sort rather than throwing — URL validation
// should prevent them, but a warning beats a white-screen crash.

import type { Game, Filters, Rating } from "@/lib/games";
import { RATINGS } from "@/lib/games";
import { type BaseGame, baseGameGenres } from "@/lib/baseGame";
import type { WishlistGame, WishlistFilters } from "@/lib/wishlist";
import type { GroupBy, SortOrder } from "./libraryConfig";

type RatingGroup = Rating | "Unrated";

const RATING_ORDER: Record<RatingGroup, number> = Object.fromEntries([
  ...RATINGS.map((r, i) => [r.name, i]),
  ["Unrated", RATINGS.length],
]);

// --- Shared helpers ---

// Filter fields present on both Filters and WishlistFilters.
type BaseFilters = { search: string; system: string; genre: string };

function passesBaseFilters(game: BaseGame, filters: BaseFilters): boolean {
  if (filters.search && !game.name.toLowerCase().includes(filters.search.toLowerCase())) {
    return false;
  }
  if (filters.system && game.system !== filters.system) return false;
  if (filters.genre && !game.genres.includes(filters.genre)) return false;
  return true;
}

// Returns keys for BaseGame-compatible GroupBy values; null for view-specific
// ones ("rating", "starred") so the caller decides.
function sharedGroupKeys(game: BaseGame, groupBy: GroupBy): string[] | null {
  switch (groupBy) {
    case "none":
      return [""];
    case "system":
      return [game.system || "Unknown"];
    case "genre":
      return baseGameGenres(game);
    case "decade": {
      const year = parseInt(game.releaseDate.slice(0, 4));
      if (isNaN(year) || year < 1970) return ["Unknown"];
      return [`${Math.floor(year / 10) * 10}s`];
    }
    default:
      return null;
  }
}

// Last-resort grouping: single unlabeled shelf + warn. Matches groupBy="none".
function fallbackGroupKeys(groupBy: GroupBy, view: string): string[] {
  console.warn(`pipeline: unsupported groupBy "${groupBy}" in ${view} view — using single shelf`);
  return [""];
}

// Returns compare result for BaseGame-compatible SortOrder values; null otherwise.
function sharedCompare(a: BaseGame, b: BaseGame, sortOrder: SortOrder): number | null {
  switch (sortOrder) {
    case "name-asc":
      return a.name.localeCompare(b.name);
    case "name-desc":
      return b.name.localeCompare(a.name);
    case "release-oldest":
      return a.releaseDate.localeCompare(b.releaseDate);
    case "release-newest":
      return b.releaseDate.localeCompare(a.releaseDate);
    default:
      return null;
  }
}

// Last-resort compare: alphabetical + warn.
function fallbackCompare(a: BaseGame, b: BaseGame, sortOrder: SortOrder, view: string): number {
  console.warn(`pipeline: unsupported sortOrder "${sortOrder}" in ${view} view — sorting by name`);
  return a.name.localeCompare(b.name);
}

// --- Played pipeline ---

export function filterGames(games: Game[], filters: Filters): Game[] {
  return games.filter((game) => {
    if (!passesBaseFilters(game, filters)) return false;
    if (filters.rating && game.rating !== filters.rating) return false;
    return true;
  });
}

function getGroupKeys(game: Game, groupBy: GroupBy): string[] {
  const shared = sharedGroupKeys(game, groupBy);
  if (shared) return shared;
  if (groupBy === "rating") return [game.rating || "Unrated"];
  return fallbackGroupKeys(groupBy, "played");
}

export function groupGames(
  games: Game[],
  groupBy: GroupBy
): Array<{ label: string; games: Game[] }> {
  const map = new Map<string, Game[]>();
  for (const game of games) {
    for (const key of getGroupKeys(game, groupBy)) {
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(game);
    }
  }

  return Array.from(map.entries())
    .map(([label, games]) => ({ label, games }))
    .sort((a, b) => {
      if (groupBy === "system") {
        return b.games.length - a.games.length || a.label.localeCompare(b.label);
      }
      if (groupBy === "rating") {
        return (
          (RATING_ORDER[a.label as RatingGroup] ?? Infinity) -
          (RATING_ORDER[b.label as RatingGroup] ?? Infinity)
        );
      }
      return a.label.localeCompare(b.label);
    });
}

export function sortGames(games: Game[], sortOrder: SortOrder): Game[] {
  return [...games].sort((a, b) => {
    const shared = sharedCompare(a, b, sortOrder);
    if (shared !== null) return shared;
    switch (sortOrder) {
      case "played-newest":
        return (b.lastPlayed || "0000").localeCompare(a.lastPlayed || "0000");
      case "played-oldest":
        return (a.lastPlayed || "9999").localeCompare(b.lastPlayed || "9999");
      default:
        return fallbackCompare(a, b, sortOrder, "played");
    }
  });
}

// --- Wishlist pipeline ---

export function filterWishlist(list: WishlistGame[], filters: WishlistFilters): WishlistGame[] {
  return list.filter((w) => passesBaseFilters(w, filters));
}

function getWishlistGroupKeys(w: WishlistGame, groupBy: GroupBy): string[] {
  const shared = sharedGroupKeys(w, groupBy);
  if (shared) return shared;
  if (groupBy === "starred") return [w.starred ? "Starred" : "Other"];
  return fallbackGroupKeys(groupBy, "wishlist");
}

export function groupWishlist(
  list: WishlistGame[],
  groupBy: GroupBy
): Array<{ label: string; games: WishlistGame[] }> {
  const map = new Map<string, WishlistGame[]>();
  for (const w of list) {
    for (const key of getWishlistGroupKeys(w, groupBy)) {
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    }
  }

  return Array.from(map.entries())
    .map(([label, games]) => ({ label, games }))
    .sort((a, b) => {
      if (groupBy === "starred") {
        // Starred shelf always first, Other below — regardless of size.
        if (a.label === "Starred") return -1;
        if (b.label === "Starred") return 1;
        return 0;
      }
      if (groupBy === "system") {
        return b.games.length - a.games.length || a.label.localeCompare(b.label);
      }
      return a.label.localeCompare(b.label);
    });
}

export function sortWishlist(list: WishlistGame[], sortOrder: SortOrder): WishlistGame[] {
  return [...list].sort((a, b) => {
    const shared = sharedCompare(a, b, sortOrder);
    if (shared !== null) return shared;
    switch (sortOrder) {
      case "added-newest":
        return (b.dateAdded || "0000").localeCompare(a.dateAdded || "0000");
      case "added-oldest":
        return (a.dateAdded || "9999").localeCompare(b.dateAdded || "9999");
      case "starred-first":
        // Boolean → number so starred (true → 1) outranks unstarred (false → 0).
        return Number(b.starred) - Number(a.starred) || a.name.localeCompare(b.name);
      default:
        return fallbackCompare(a, b, sortOrder, "wishlist");
    }
  });
}
