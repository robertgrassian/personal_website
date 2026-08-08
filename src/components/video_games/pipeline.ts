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

// One collator for the whole module, rather than a fresh one per comparison.
// `"a".localeCompare("b")` has to resolve the locale and build a collator on
// every call; Intl.Collator does that work once and hands back a reusable
// compare function with identical semantics. It matters here because sorting
// 155 games is ~1,100 comparisons, re-run on every keystroke.
const collator = new Intl.Collator();

// Ordering for strings that are fixed-width ASCII (ISO dates, "1990s"), where
// byte order and collation order agree. Roughly 10x cheaper per comparison than
// full ICU collation, which is why these do not go through `collator` above.
// Only safe because the inputs are machine-generated: never use this on a name.
export function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// --- Shared helpers ---

// Filter fields present on both Filters and WishlistFilters.
type BaseFilters = { search: string; system: string; genre: string };

// The same fields with the search term already lowercased. Built once per
// filter pass instead of once per game: `search` is a single query string, so
// lowercasing it inside the per-game predicate did the identical work ~155
// times for nothing on every keystroke.
type PreparedBaseFilters = { needle: string; system: string; genre: string };

function prepareBaseFilters(filters: BaseFilters): PreparedBaseFilters {
  return {
    needle: filters.search.toLowerCase(),
    system: filters.system,
    genre: filters.genre,
  };
}

function passesBaseFilters(game: BaseGame, filters: PreparedBaseFilters): boolean {
  if (filters.needle && !game.name.toLowerCase().includes(filters.needle)) {
    return false;
  }
  if (filters.system && game.system !== filters.system) return false;
  if (filters.genre && !game.genres.includes(filters.genre)) return false;
  return true;
}

// Returns keys for BaseGame-compatible GroupBy values; null for view-specific
// ones ("rating") so the caller decides.
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
      return collator.compare(a.name, b.name);
    case "name-desc":
      return collator.compare(b.name, a.name);
    case "release-oldest":
      return compareIso(a.releaseDate, b.releaseDate);
    case "release-newest":
      return compareIso(b.releaseDate, a.releaseDate);
    default:
      return null;
  }
}

// Last-resort compare: alphabetical + warn.
function fallbackCompare(a: BaseGame, b: BaseGame, sortOrder: SortOrder, view: string): number {
  console.warn(`pipeline: unsupported sortOrder "${sortOrder}" in ${view} view — sorting by name`);
  return collator.compare(a.name, b.name);
}

// --- Played pipeline ---

export function filterGames(games: Game[], filters: Filters): Game[] {
  const base = prepareBaseFilters(filters);
  return games.filter((game) => {
    if (!passesBaseFilters(game, base)) return false;
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
        return b.games.length - a.games.length || collator.compare(a.label, b.label);
      }
      if (groupBy === "rating") {
        return (
          (RATING_ORDER[a.label as RatingGroup] ?? Infinity) -
          (RATING_ORDER[b.label as RatingGroup] ?? Infinity)
        );
      }
      return collator.compare(a.label, b.label);
    });
}

export function sortGames(games: Game[], sortOrder: SortOrder): Game[] {
  return [...games].sort((a, b) => {
    const shared = sharedCompare(a, b, sortOrder);
    if (shared !== null) return shared;
    switch (sortOrder) {
      case "played-newest":
        return compareIso(b.lastPlayed || "0000", a.lastPlayed || "0000");
      case "played-oldest":
        return compareIso(a.lastPlayed || "9999", b.lastPlayed || "9999");
      default:
        return fallbackCompare(a, b, sortOrder, "played");
    }
  });
}

// --- Wishlist pipeline ---

export function filterWishlist(list: WishlistGame[], filters: WishlistFilters): WishlistGame[] {
  const base = prepareBaseFilters(filters);
  return list.filter((w) => passesBaseFilters(w, base));
}

const STARRED_LABEL = "Starred";

function getWishlistGroupKeys(w: WishlistGame, groupBy: GroupBy): string[] {
  return sharedGroupKeys(w, groupBy) ?? fallbackGroupKeys(groupBy, "wishlist");
}

// Starred items are always pulled out into a single leading shelf; `groupBy`
// only ever applies to what's left. A starred item therefore appears once, on
// the Starred shelf, never also under its system/genre/decade.
export function groupWishlist(
  list: WishlistGame[],
  groupBy: GroupBy
): Array<{ label: string; games: WishlistGame[] }> {
  const starred = list.filter((w) => w.starred);
  const rest = list.filter((w) => !w.starred);

  const map = new Map<string, WishlistGame[]>();
  for (const w of rest) {
    for (const key of getWishlistGroupKeys(w, groupBy)) {
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    }
  }

  const groups = Array.from(map.entries())
    .map(([label, games]) => ({ label, games }))
    .sort((a, b) => {
      if (groupBy === "system") {
        return b.games.length - a.games.length || collator.compare(a.label, b.label);
      }
      return collator.compare(a.label, b.label);
    });

  // Prepended rather than sorted in, so no group can ever outrank it.
  return starred.length > 0 ? [{ label: STARRED_LABEL, games: starred }, ...groups] : groups;
}

export function sortWishlist(list: WishlistGame[], sortOrder: SortOrder): WishlistGame[] {
  return [...list].sort((a, b) => {
    const shared = sharedCompare(a, b, sortOrder);
    if (shared !== null) return shared;
    switch (sortOrder) {
      case "added-newest":
        return compareIso(b.dateAdded || "0000", a.dateAdded || "0000");
      case "added-oldest":
        return compareIso(a.dateAdded || "9999", b.dateAdded || "9999");
      default:
        return fallbackCompare(a, b, sortOrder, "wishlist");
    }
  });
}
