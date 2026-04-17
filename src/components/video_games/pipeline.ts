// Pure filter/group/sort helpers for the game library. No React, no hooks.
// Split from GameLibrary.tsx so rendering stays focused on orchestration.
//
// Unreachable switch cases throw instead of silently falling through —
// URL validation prevents them, but if validation ever drifts, a loud
// error is far easier to debug than a silently wrong default.

import type { Game, Filters, Rating } from "@/lib/games";
import { RATINGS, gameGenres } from "@/lib/games";
import { baseGameGenres } from "@/lib/baseGame";
import type { WishlistGame, WishlistFilters } from "@/lib/wishlist";
import type { GroupBy, SortOrder } from "./libraryConfig";

type RatingGroup = Rating | "Unrated";

const RATING_ORDER: Record<RatingGroup, number> = Object.fromEntries([
  ...RATINGS.map((r, i) => [r.name, i]),
  ["Unrated", RATINGS.length],
]);

// --- Played pipeline ---

export function filterGames(games: Game[], filters: Filters): Game[] {
  return games.filter((game) => {
    if (filters.search && !game.name.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.rating && game.rating !== filters.rating) return false;
    if (filters.system && game.system !== filters.system) return false;
    if (filters.genre && !game.genres.includes(filters.genre)) return false;
    return true;
  });
}

function getGroupKeys(game: Game, groupBy: GroupBy): string[] {
  switch (groupBy) {
    case "none":
      return [""];
    case "system":
      return [game.system || "Unknown"];
    case "rating":
      return [game.rating || "Unrated"];
    case "genre":
      return gameGenres(game);
    case "decade": {
      const year = parseInt(game.releaseDate.slice(0, 4));
      if (isNaN(year) || year < 1970) return ["Unknown"];
      return [`${Math.floor(year / 10) * 10}s`];
    }
    case "starred":
      throw new Error(`unreachable: groupBy "starred" in played view`);
  }
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
    switch (sortOrder) {
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "release-oldest":
        return a.releaseDate.localeCompare(b.releaseDate);
      case "release-newest":
        return b.releaseDate.localeCompare(a.releaseDate);
      case "played-newest":
        return (b.lastPlayed || "0000").localeCompare(a.lastPlayed || "0000");
      case "played-oldest":
        return (a.lastPlayed || "9999").localeCompare(b.lastPlayed || "9999");
      case "added-newest":
      case "added-oldest":
      case "starred-first":
        throw new Error(`unreachable: sortOrder "${sortOrder}" in played view`);
    }
  });
}

// --- Wishlist pipeline ---

export function filterWishlist(list: WishlistGame[], filters: WishlistFilters): WishlistGame[] {
  return list.filter((w) => {
    if (filters.search && !w.name.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.system && w.system !== filters.system) return false;
    if (filters.genre && !w.genres.includes(filters.genre)) return false;
    return true;
  });
}

function getWishlistGroupKeys(w: WishlistGame, groupBy: GroupBy): string[] {
  switch (groupBy) {
    case "none":
      return [""];
    case "system":
      return [w.system || "Unknown"];
    case "starred":
      return [w.starred ? "Starred" : "Other"];
    case "genre":
      return baseGameGenres(w);
    case "decade": {
      const year = parseInt(w.releaseDate.slice(0, 4));
      if (isNaN(year) || year < 1970) return ["Unknown"];
      return [`${Math.floor(year / 10) * 10}s`];
    }
    case "rating":
      throw new Error(`unreachable: groupBy "rating" in wishlist view`);
  }
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
    switch (sortOrder) {
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "release-oldest":
        return a.releaseDate.localeCompare(b.releaseDate);
      case "release-newest":
        return b.releaseDate.localeCompare(a.releaseDate);
      case "added-newest":
        return (b.dateAdded || "0000").localeCompare(a.dateAdded || "0000");
      case "added-oldest":
        return (a.dateAdded || "9999").localeCompare(b.dateAdded || "9999");
      case "starred-first":
        // Boolean → number so starred (true → 1) outranks unstarred (false → 0).
        return Number(b.starred) - Number(a.starred) || a.name.localeCompare(b.name);
      case "played-newest":
      case "played-oldest":
        throw new Error(`unreachable: sortOrder "${sortOrder}" in wishlist view`);
    }
  });
}
