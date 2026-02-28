"use client";

// "use client" marks this as the boundary between Server and Client rendering.
// Everything this component imports also runs on the client, even without their own "use client".
// This is where interactivity lives: useState, event handlers, browser APIs.

import { useState, useMemo } from "react";
import type { Game, Filters } from "@/lib/games";
import { RATINGS } from "@/lib/games";
import { ShelfSection } from "./ShelfSection";
import { FilterBar } from "./FilterBar";

// --- Types ---

// GroupBy determines which property creates the shelf labels/groupings.
export type GroupBy = "system" | "rating" | "genre" | "decade";

// SortOrder determines game order within each individual shelf.
export type SortOrder =
  | "name-asc"
  | "name-desc"
  | "release-oldest"
  | "release-newest"
  | "played-newest"
  | "played-oldest";

// --- Pure helper functions ---
// Defined outside the component so React doesn't recreate them on each render.

function filterGames(games: Game[], filters: Filters): Game[] {
  return games.filter((game) => {
    // Falsy check: if a filter string is "" (empty), it evaluates to false → skip the check.
    if (filters.search && !game.name.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.rating && game.rating !== filters.rating) {
      return false;
    }
    if (filters.system && game.system !== filters.system) {
      return false;
    }
    if (filters.genre && !game.genres.includes(filters.genre)) {
      return false;
    }
    return true;
  });
}

function getGroupKey(game: Game, groupBy: GroupBy): string {
  switch (groupBy) {
    case "system":
      return game.system || "Unknown";
    case "rating":
      return game.rating || "Unrated";
    case "genre":
      // A game can have multiple genres — we group by the primary (first) one.
      return game.genres[0] || "Unknown";
    case "decade": {
      const year = parseInt(game.releaseDate.slice(0, 4));
      if (isNaN(year) || year < 1970) return "Unknown";
      // Math.floor(year / 10) * 10 → e.g. 2023 → 2020 → "2020s"
      return `${Math.floor(year / 10) * 10}s`;
    }
  }
}

function groupGames(games: Game[], groupBy: GroupBy): Array<{ label: string; games: Game[] }> {
  // Map preserves insertion order — we collect games by key, then sort labels alphabetically.
  const map = new Map<string, Game[]>();
  for (const game of games) {
    const key = getGroupKey(game, groupBy);
    // Push into the existing array rather than spreading into a new one on every iteration.
    // The spread pattern [...(map.get(key) ?? []), game] is O(n²) — it copies the whole
    // array each time. This push approach is O(n) total.
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(game);
  }

  const RATING_ORDER = Object.fromEntries([...RATINGS.map((r, i) => [r, i]), ["Unrated", RATINGS.length]]);

  return Array.from(map.entries())
    .map(([label, games]) => ({ label, games }))
    .sort((a, b) => {
      // For system grouping: most games first, so the biggest shelves lead the page.
      // Ties (unlikely but possible) fall back to alphabetical.
      if (groupBy === "system") {
        return b.games.length - a.games.length || a.label.localeCompare(b.label);
      }
      // For rating grouping: best ratings first (Perfect/S → Bad/F).
      if (groupBy === "rating") {
        return (RATING_ORDER[a.label] ?? 99) - (RATING_ORDER[b.label] ?? 99);
      }
      // All other groupings: alphabetical.
      return a.label.localeCompare(b.label);
    });
}

function sortGames(games: Game[], sortOrder: SortOrder): Game[] {
  // Spread [...games] creates a shallow copy so we don't mutate the input array.
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
        // Games with no firstPlayed ("") sort to the end via "0000" sentinel
        return (b.firstPlayed || "0000").localeCompare(a.firstPlayed || "0000");
      case "played-oldest":
        // Games with no firstPlayed ("") sort to the end via "9999" sentinel
        return (a.firstPlayed || "9999").localeCompare(b.firstPlayed || "9999");
    }
  });
}

// --- Component ---

type GameLibraryProps = {
  games: Game[]; // Full game list, received from the Server Component
};

const INITIAL_FILTERS: Filters = { search: "", rating: "", system: "", genre: "" };

export function GameLibrary({ games }: GameLibraryProps) {
  // The four filter fields are one logical unit, so they share a single state object.
  // Grouping related state makes it easier to reason about and reset all at once.
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [groupBy, setGroupBy] = useState<GroupBy>("system");
  const [sortOrder, setSortOrder] = useState<SortOrder>("name-asc");

  // Helper to update a single filter key while preserving the rest.
  // The callback form (prev => ...) is important: it guarantees we merge into the *latest*
  // state snapshot, not a potentially stale closure.
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  // Derive unique systems and genres for the filter dropdowns.
  // useMemo memoizes the result until its dependencies change.
  // Since `games` is a stable prop set once from the server, these compute only once.
  const allSystems = useMemo(() => [...new Set(games.map((g) => g.system))].sort(), [games]);
  const allGenres = useMemo(() => [...new Set(games.flatMap((g) => g.genres))].sort(), [games]);

  // The display pipeline: filter → group → sort within each group.
  // useMemo means this only reruns when one of the listed dependencies actually changes.
  // This is the "derived state" pattern — shelves are computed from state, never stored.
  const shelves = useMemo(() => {
    const filtered = filterGames(games, filters);
    const groups = groupGames(filtered, groupBy);
    // Sort games within each shelf, keeping empty shelves out of the output entirely
    return groups
      .filter((g) => g.games.length > 0)
      .map((group) => ({
        ...group,
        games: sortGames(group.games, sortOrder),
      }));
  }, [games, filters, groupBy, sortOrder]);

  return (
    <div className="mt-8">
      <FilterBar
        filters={filters}
        onFilterChange={setFilter}
        groupBy={groupBy}
        sortOrder={sortOrder}
        allSystems={allSystems}
        allGenres={allGenres}
        onGroupByChange={setGroupBy}
        onSortOrderChange={setSortOrder}
      />

      {shelves.length === 0 ? (
        <p className="mt-24 text-center text-shelf-text-muted text-lg italic">
          No games match your filters.
        </p>
      ) : (
        <div className="mt-6 pb-24">
          {shelves.map((shelf) => (
            <ShelfSection key={shelf.label} label={shelf.label} games={shelf.games} />
          ))}
        </div>
      )}
    </div>
  );
}
