"use client";

// "use client" marks this as the boundary between Server and Client rendering.
// Everything this component imports also runs on the client.

import { useState, useEffect, useTransition, useRef, useMemo, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Game, Filters, Rating } from "@/lib/games";
import { RATINGS } from "@/lib/games";
import { ShelfSection } from "./ShelfSection";
import { FilterBar } from "./FilterBar";
import { StatsPanel } from "./StatsPanel";
import { ChartBarIcon } from "@/components/Icon";

// --- Types ---

type RatingGroup = Rating | "Unrated";

// GroupBy determines which property creates shelf labels/groupings.
// "none" puts all games on a single unlabeled shelf.
export type GroupBy = "none" | "system" | "rating" | "genre" | "decade";

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
    // Empty string means "no filter applied" for that field.
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
      // A game with multiple genres appears in a shelf for each one.
      return game.genres.length > 0 ? game.genres : ["Unknown"];
    case "decade": {
      const year = parseInt(game.releaseDate.slice(0, 4));
      if (isNaN(year) || year < 1970) return ["Unknown"];
      return [`${Math.floor(year / 10) * 10}s`];
    }
  }
}

function groupGames(games: Game[], groupBy: GroupBy): Array<{ label: string; games: Game[] }> {
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

function sortGames(games: Game[], sortOrder: SortOrder): Game[] {
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
    }
  });
}

// --- Component ---

type GameLibraryProps = {
  games: Game[];
};

// Default values are omitted from the URL to keep it clean.
const DEFAULT_GROUP_BY: GroupBy = "rating";
const DEFAULT_SORT_ORDER: SortOrder = "name-asc";

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

  // searchInput is local state so the text field responds instantly to every keystroke.
  // Initialized from the URL so the value is correct on a shared/refreshed link.
  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");

  // "Latest ref" pattern: always holds the current searchParams without being a dep.
  // The debounce timer reads this ref when it fires so it sees the most recent params
  // without searchParams in its dep array (which would reset the timer on every URL change).
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }); // intentionally no dep array — runs after every render

  // Sync searchInput when the URL changes externally (e.g. clearFilters).
  // React bails out of re-renders when setState is called with the same value.
  useEffect(() => {
    setSearchInput(searchParams.get("search") ?? "");
  }, [searchParams]);

  // Debounce: update the URL only after the user pauses typing (300ms).
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

  // Filter/sort/group state lives in the URL so it survives refresh and navigation.
  const filters = useMemo<Filters>(
    () => ({
      search: searchParams.get("search") ?? "",
      rating: (searchParams.get("rating") ?? "") as Rating | "",
      system: searchParams.get("system") ?? "",
      genre: searchParams.get("genre") ?? "",
    }),
    [searchParams]
  );

  const rawGroupBy = searchParams.get("groupBy");
  const groupBy: GroupBy = VALID_GROUP_BY.includes(rawGroupBy as GroupBy)
    ? (rawGroupBy as GroupBy)
    : DEFAULT_GROUP_BY;

  const rawSortOrder = searchParams.get("sortOrder");
  const sortOrder: SortOrder = VALID_SORT_ORDER.includes(rawSortOrder as SortOrder)
    ? (rawSortOrder as SortOrder)
    : DEFAULT_SORT_ORDER;

  // activeFilters uses live searchInput so the shelf updates on every keystroke,
  // while the URL catches up after the debounce.
  const activeFilters = useMemo(
    () => ({ ...filters, search: searchInput }),
    [filters, searchInput]
  );

  // router.replace() updates the URL without pushing a history entry.
  // startTransition marks the navigation as non-urgent so the UI stays responsive.
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

  // Clears filter params; view preferences (groupBy, sortOrder) are preserved.
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

  // games is a stable prop from the server — these compute only once.
  const allSystems = useMemo(() => [...new Set(games.map((g) => g.system))].sort(), [games]);
  const allGenres = useMemo(() => [...new Set(games.flatMap((g) => g.genres))].sort(), [games]);

  // For each dropdown, compute which options still yield results given the other active filters.
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

  // Derived display pipeline: filter → group → sort within each group.
  const shelves = useMemo(() => {
    const filtered = filterGames(games, activeFilters);
    const groups =
      groupBy === "none" ? [{ label: "", games: filtered }] : groupGames(filtered, groupBy);
    return groups
      .filter((g) => g.games.length > 0)
      .map((group) => ({
        ...group,
        games: sortGames(group.games, sortOrder),
      }));
  }, [games, activeFilters, groupBy, sortOrder]);

  const filteredCount = shelves.reduce((sum, s) => sum + s.games.length, 0);

  const hasActiveFilters =
    activeFilters.search !== "" ||
    activeFilters.rating !== "" ||
    activeFilters.system !== "" ||
    activeFilters.genre !== "";

  return (
    <div className="mt-8">
      {/* Stats icon — opens the slide-over panel */}
      <div className="flex items-center justify-end mb-4">
        <button
          type="button"
          onClick={() => setStatsOpen(true)}
          aria-label="Open library stats"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted border border-divider hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
        >
          <ChartBarIcon className="w-4 h-4" aria-hidden />
          Stats
        </button>
      </div>

      {hasActiveFilters && (
        <div className="flex items-center gap-3 mb-3">
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
        </div>
      )}

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

      <StatsPanel games={games} isOpen={statsOpen} onClose={() => setStatsOpen(false)} />
    </div>
  );
}
