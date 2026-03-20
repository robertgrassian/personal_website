"use client";

// "use client" marks this as the boundary between Server and Client rendering.
// Everything this component imports also runs on the client, even without their own "use client".
// This is where interactivity lives: hooks, event handlers, browser APIs.

import { useState, useEffect, useTransition, useRef, useMemo, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Game, Filters, Rating } from "@/lib/games";
import { RATINGS } from "@/lib/games";
import { ShelfSection } from "./ShelfSection";
import { FilterBar } from "./FilterBar";
import { StatsPanel } from "./StatsPanel";
import { ChartBarIcon } from "@/components/Icon";

// --- Types ---

// RatingGroup represents the possible labels when grouping games by rating.
type RatingGroup = Rating | "Unrated";

// GroupBy determines which property creates the shelf labels/groupings.
// "none" puts all games on a single unlabeled shelf.
export type GroupBy = "none" | "system" | "rating" | "genre" | "decade";

// SortOrder determines game order within each individual shelf.
export type SortOrder =
  | "name-asc"
  | "name-desc"
  | "release-oldest"
  | "release-newest"
  | "played-newest"
  | "played-oldest";

const RATING_ORDER: Record<RatingGroup, number> = Object.fromEntries([
  ...RATINGS.map((r, i) => [r.name, i]),
  ["Unrated", RATINGS.length],
]);

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
    case "none":
      return "";
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
        return (
          (RATING_ORDER[a.label as RatingGroup] ?? Infinity) -
          (RATING_ORDER[b.label as RatingGroup] ?? Infinity)
        );
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
        // Games with no lastPlayed ("") sort to the end via "0000" sentinel
        return (b.lastPlayed || "0000").localeCompare(a.lastPlayed || "0000");
      case "played-oldest":
        // Games with no lastPlayed ("") sort to the end via "9999" sentinel
        return (a.lastPlayed || "9999").localeCompare(b.lastPlayed || "9999");
    }
  });
}

// --- Component ---

type GameLibraryProps = {
  games: Game[]; // Full game list, received from the Server Component
};

// Defaults are omitted from the URL to keep it clean.
// When a param is absent, we fall back to these values on read.
const DEFAULT_GROUP_BY: GroupBy = "system";
const DEFAULT_SORT_ORDER: SortOrder = "name-asc";

// Used to validate URL params — an unknown string from the URL falls back to the default.
const VALID_GROUP_BY: readonly GroupBy[] = ["none", "system", "rating", "genre", "decade"];
const VALID_SORT_ORDER: readonly SortOrder[] = [
  "name-asc",
  "name-desc",
  "release-oldest",
  "release-newest",
  "played-newest",
  "played-oldest",
];

export function GameLibrary({ games }: GameLibraryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [statsOpen, setStatsOpen] = useState(false);

  // searchInput is local state so the text input responds instantly to every keystroke.
  // It's initialized from the URL so the value is correct on first render (e.g. shared link).
  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");

  // "Latest ref" pattern: always holds the current searchParams without being a dep.
  // The debounce timer reads this ref when it fires so it sees the most recent params,
  // without searchParams in its dep array (which would reset the timer on every URL change).
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }); // no dep array — intentionally runs after every render

  // Sync searchInput back to local state when the URL changes externally
  // (e.g. when clearFilters removes the search param).
  // No guard needed: React bails out of re-renders when setState is called with the same value.
  useEffect(() => {
    setSearchInput(searchParams.get("search") ?? "");
  }, [searchParams]);

  // Debounce: wait until the user pauses typing before updating the URL.
  // This prevents a router.replace() on every keystroke.
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
    return () => clearTimeout(timer); // Cancel the pending timer if the user types again
  }, [searchInput, pathname, router]);

  // Filter/sort/group state lives in the URL so it survives refresh and navigation.
  // searchParams is a stable reference — it only changes when the URL actually changes.
  const filters = useMemo<Filters>(
    () => ({
      search: searchParams.get("search") ?? "",
      rating: (searchParams.get("rating") ?? "") as Rating | "",
      system: searchParams.get("system") ?? "",
      genre: searchParams.get("genre") ?? "",
    }),
    [searchParams]
  );
  // groupBy and sortOrder are primitive strings, not objects, so no useMemo needed —
  // React compares primitive deps by value, not reference, so downstream memos won't re-run spuriously.
  const rawGroupBy = searchParams.get("groupBy");
  const groupBy: GroupBy = VALID_GROUP_BY.includes(rawGroupBy as GroupBy)
    ? (rawGroupBy as GroupBy)
    : DEFAULT_GROUP_BY;

  const rawSortOrder = searchParams.get("sortOrder");
  const sortOrder: SortOrder = VALID_SORT_ORDER.includes(rawSortOrder as SortOrder)
    ? (rawSortOrder as SortOrder)
    : DEFAULT_SORT_ORDER;

  // activeFilters drives all filtering logic — search comes from local state so results
  // update instantly on each keystroke, while the URL catches up after the debounce.
  const activeFilters = useMemo(
    () => ({ ...filters, search: searchInput }),
    [filters, searchInput]
  );

  // Default values are omitted from the URL to keep it clean; absent params fall back to defaults on read.
  // router.replace() updates the URL without pushing a new history entry, so back-button behavior is preserved.
  // startTransition marks the navigation as non-urgent so React keeps the UI responsive.
  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const isDefault =
        value === "" ||
        (key === "groupBy" && value === DEFAULT_GROUP_BY) ||
        (key === "sortOrder" && value === DEFAULT_SORT_ORDER);
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

  // "search" key updates local state only — the debounce effect handles the URL sync.
  const setFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      if (key === "search") {
        setSearchInput(value as string);
      } else {
        updateParam(key, value as string);
      }
    },
    [updateParam]
  );

  const setGroupBy = useCallback((value: GroupBy) => updateParam("groupBy", value), [updateParam]);
  const setSortOrder = useCallback(
    (value: SortOrder) => updateParam("sortOrder", value),
    [updateParam]
  );

  // Clears filter params only; groupBy and sortOrder are view preferences and are preserved.
  // searchInput is cleared immediately so the input resets without waiting for the URL round-trip.
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

  // Derive unique systems and genres for the filter dropdowns.
  // useMemo memoizes the result until its dependencies change.
  // Since `games` is a stable prop set once from the server, these compute only once.
  const allSystems = useMemo(() => [...new Set(games.map((g) => g.system))].sort(), [games]);
  const allGenres = useMemo(() => [...new Set(games.flatMap((g) => g.genres))].sort(), [games]);

  // For each dropdown, compute which values still produce results given the *other* active filters.
  // We clear just that one filter key before filtering, so we're asking:
  // "if the user picks this option, would anything match everything else they've set?"
  const availableRatings = useMemo(
    () =>
      new Set(
        filterGames(games, { ...activeFilters, rating: "" })
          .map((g) => g.rating)
          .filter((r) => r !== "")
      ),
    [games, activeFilters]
  );
  const availableSystems = useMemo(
    () => new Set(filterGames(games, { ...activeFilters, system: "" }).map((g) => g.system)),
    [games, activeFilters]
  );
  const availableGenres = useMemo(
    () => new Set(filterGames(games, { ...activeFilters, genre: "" }).flatMap((g) => g.genres)),
    [games, activeFilters]
  );

  // The display pipeline: filter → group → sort within each group.
  // useMemo means this only reruns when one of the listed dependencies actually changes.
  // This is the "derived state" pattern — shelves are computed from state, never stored.
  const shelves = useMemo(() => {
    const filtered = filterGames(games, activeFilters);
    // "none" skips grouping entirely — one unlabeled shelf with all filtered games.
    const groups =
      groupBy === "none" ? [{ label: "", games: filtered }] : groupGames(filtered, groupBy);
    return groups
      .filter((g) => g.games.length > 0)
      .map((group) => ({
        ...group,
        games: sortGames(group.games, sortOrder),
      }));
  }, [games, activeFilters, groupBy, sortOrder]);

  // Total games currently visible across all shelves (after filtering).
  const filteredCount = shelves.reduce((sum, s) => sum + s.games.length, 0);

  const hasActiveFilters =
    activeFilters.search !== "" ||
    activeFilters.rating !== "" ||
    activeFilters.system !== "" ||
    activeFilters.genre !== "";

  return (
    <div className="mt-8">
      {/* Top bar: game count / active-filter controls on the left, Stats trigger on the right */}
      <div className="flex items-center justify-between mb-3 min-h-[1.5rem]">
        <div className="flex items-center gap-3">
          {hasActiveFilters && (
            <>
              <span className="text-shelf-text-muted text-sm">
                {filteredCount} of {games.length} games
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="text-shelf-text-muted text-sm underline underline-offset-2 cursor-pointer hover:text-shelf-text transition-colors"
              >
                Clear filters
              </button>
            </>
          )}
        </div>

        {/* Stats trigger — always visible, anchored to the right */}
        <button
          type="button"
          onClick={() => setStatsOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-shelf-text-muted text-sm hover:text-link hover:bg-shelf-input transition-colors cursor-pointer"
        >
          <ChartBarIcon className="w-4 h-4" aria-hidden />
          <span>Stats</span>
        </button>
      </div>

      <StatsPanel games={games} isOpen={statsOpen} onClose={() => setStatsOpen(false)} />

      <FilterBar
        filters={activeFilters}
        onFilterChange={setFilter}
        groupBy={groupBy}
        sortOrder={sortOrder}
        allSystems={allSystems}
        allGenres={allGenres}
        availableRatings={availableRatings}
        availableSystems={availableSystems}
        availableGenres={availableGenres}
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
