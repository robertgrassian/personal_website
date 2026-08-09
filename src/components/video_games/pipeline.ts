// Pure filter/group/sort helpers. No React, no hooks.
//
// Each pipeline calls a shared helper for BaseGame cases; the helper returns
// null for view-specific keys so the caller handles them. Unrecognized values
// warn and fall back to name-sort rather than throwing — URL validation
// should prevent them, but a warning beats a white-screen crash.

import type { Game, Filters, Rating } from "@/lib/games";
import { RATINGS, UNRATED_LABEL } from "@/lib/games";
import { type BaseGame, baseGameGenres } from "@/lib/baseGame";
import type { WishlistGame, WishlistFilters } from "@/lib/wishlist";
import type { GroupBy, SortOrder } from "./libraryConfig";

type RatingGroup = Rating | typeof UNRATED_LABEL;

// Unrated sorts after every real rating, so the Unrated shelf is always last
// under groupBy="rating" no matter how many ratings exist.
const RATING_ORDER: Record<RatingGroup, number> = Object.fromEntries([
  ...RATINGS.map((r, i) => [r.name, i]),
  [UNRATED_LABEL, RATINGS.length],
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

// Accent folding for the search box: "pokemon" has to find "Pokémon", "okami"
// has to find "Ōkami". NFD splits an accented character into its base letter
// plus a combining mark, and \p{Diacritic} then drops the marks, leaving the
// ASCII letter behind. Both sides go through it, so typing the accent works too.
//
// Deliberately only accents. Punctuation folding (so "resident evil 4" matches
// "Resident Evil 4: Remake") and real fuzzy matching are both possible here and
// both deliberately skipped: on a library you know by heart, a two-character
// query returning things you did not ask for is worse than a miss.
//
// Folding is not free. `normalize("NFD")` is an ICU call and `\p{Diacritic}`
// is a Unicode-property regex, so measured over 155 names across the two
// per-keystroke passes it costs ~0.12ms against ~0.03ms for the plain
// `toLowerCase()` it replaced. Small in absolute terms, but it is pure waste:
// the query changes on every keystroke, the names never change at all.
const DIACRITICS = /\p{Diacritic}/gu;

export function foldForSearch(value: string): string {
  return value.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

// Folded game names, cached so a name is folded once rather than once per
// keystroke (~0.12ms down to ~0.02ms over the same two passes).
//
// Keyed on the game OBJECT, not on its name string, which is what makes a
// WeakMap the right container and removes the two problems a string-keyed
// cache would have: entries become collectable with the games themselves, so
// nothing grows without bound as libraries are browsed, and a fresh server
// payload mints fresh objects, so there is no invalidation rule to get wrong.
//
// The one thing it assumes is that a game's `name` is not mutated in place.
// Nothing does that -- rows arrive from the API and are treated as immutable,
// and an owner edit revalidates into a new payload rather than patching the
// object.
const foldedNames = new WeakMap<BaseGame, string>();

function foldedName(game: BaseGame): string {
  const cached = foldedNames.get(game);
  if (cached !== undefined) return cached;
  const folded = foldForSearch(game.name);
  foldedNames.set(game, folded);
  return folded;
}

// --- Shared helpers ---

// Filter fields present on both Filters and WishlistFilters.
type BaseFilters = { search: string; system: string; genre: string };

// The same fields with the search term already folded. Built once per filter
// pass instead of once per game: `search` is a single query string, so folding
// it inside the per-game predicate did the identical work ~155 times for
// nothing on every keystroke.
type PreparedBaseFilters = { needle: string; system: string; genre: string };

function prepareBaseFilters(filters: BaseFilters): PreparedBaseFilters {
  return {
    needle: foldForSearch(filters.search),
    system: filters.system,
    genre: filters.genre,
  };
}

function passesBaseFilters(game: BaseGame, filters: PreparedBaseFilters): boolean {
  if (filters.needle && !foldedName(game).includes(filters.needle)) {
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
    // `game.rating || UNRATED_LABEL` is the same normalization getGroupKeys and
    // collectAvailableGameFilters use: a rating-less game stores "", which no
    // filter value ever equals, so it has to be named before it can be compared.
    if (filters.rating && (game.rating || UNRATED_LABEL) !== filters.rating) return false;
    return true;
  });
}

// The values each dropdown can still offer without emptying the shelves.
// Options outside these sets render disabled in FilterBar.
export type AvailableGameFilters = {
  ratings: Set<string>;
  systems: Set<string>;
  genres: Set<string>;
};

/** Collect all three "available" sets in a single traversal.
 *
 *  Each set answers "what could this dropdown be changed to?", so each one is
 *  computed against the other filters with its own key dropped: available
 *  systems ignore the current system, available genres ignore the current
 *  genre, and so on. Done literally that is three full filterGames() scans
 *  (nine predicate evaluations per game). Here the four components are
 *  evaluated once each and the three sets read the combinations they need, so
 *  it is four evaluations over one pass.
 *
 *  Search is the one component every set shares, which is why a search miss
 *  can skip the game entirely. */
export function collectAvailableGameFilters(games: Game[], filters: Filters): AvailableGameFilters {
  const { needle, system, genre } = prepareBaseFilters(filters);
  const ratings = new Set<string>();
  const systems = new Set<string>();
  const genres = new Set<string>();

  for (const game of games) {
    if (needle && !foldedName(game).includes(needle)) continue;
    // Named before it is compared or collected, the same normalization
    // filterGames and getGroupKeys use. A rating-less game stores "", which is
    // the "no filter" value and so equals nothing the dropdown offers.
    const rating = game.rating || UNRATED_LABEL;
    const matchesSystem = !system || game.system === system;
    const matchesGenre = !genre || game.genres.includes(genre);
    const matchesRating = !filters.rating || rating === filters.rating;

    // "Unrated" is a rating option like any other, so it enables and disables
    // on the same rule. It used to be dropped here, back when unrated games
    // lived on their own shelf outside the pipeline.
    if (matchesSystem && matchesGenre) ratings.add(rating);
    if (matchesRating && matchesGenre) systems.add(game.system);
    if (matchesRating && matchesSystem) {
      for (const g of game.genres) genres.add(g);
    }
  }

  return { ratings, systems, genres };
}

function getGroupKeys(game: Game, groupBy: GroupBy): string[] {
  const shared = sharedGroupKeys(game, groupBy);
  if (shared) return shared;
  if (groupBy === "rating") return [game.rating || UNRATED_LABEL];
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

// The wishlist half of collectAvailableGameFilters. Two sets rather than three
// (no rating on a wishlist entry), same one-pass shape.
export type AvailableWishlistFilters = {
  systems: Set<string>;
  genres: Set<string>;
};

export function collectAvailableWishlistFilters(
  list: WishlistGame[],
  filters: WishlistFilters
): AvailableWishlistFilters {
  const { needle, system, genre } = prepareBaseFilters(filters);
  const systems = new Set<string>();
  const genres = new Set<string>();

  for (const w of list) {
    if (needle && !foldedName(w).includes(needle)) continue;
    if (!genre || w.genres.includes(genre)) systems.add(w.system);
    if (!system || w.system === system) {
      for (const g of w.genres) genres.add(g);
    }
  }

  return { systems, genres };
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
