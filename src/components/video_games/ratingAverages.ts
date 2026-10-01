import type { Game } from "../../lib/games.ts";
import { MAX_RATING_SCORE, RATINGS, ratingScore } from "../../lib/games.ts";

// Pure: no React. GameStats memoizes these; ratingAverages.test.ts runs them.

/** A bucket needs this many RATED games before its average is shown. */
export const MIN_RATED_GAMES = 3;

/** Rows shown at each end of a ranking too long to show whole. */
export const ENDS_SIZE = 5;

export type RatingAverage = {
  label: string;
  average: number;
  /** Rated games in the bucket: the sample size, not the bucket's total. */
  rated: number;
};

/** One bucket per key a game yields, best first. A game in two genres counts toward both. */
export function averageRatingBy(games: Game[], keysOf: (game: Game) => string[]): RatingAverage[] {
  const totals = new Map<string, { sum: number; rated: number }>();
  for (const game of games) {
    // An unrated game is no evidence either way, so it is skipped rather than
    // scored as zero, which would make a genre you have not rated look bad.
    const score = ratingScore(game.rating);
    if (score === null) continue;
    // A Set so a duplicated genre on one game cannot count that game twice.
    for (const key of new Set(keysOf(game))) {
      if (!key) continue;
      const bucket = totals.get(key) ?? { sum: 0, rated: 0 };
      bucket.sum += score;
      bucket.rated += 1;
      totals.set(key, bucket);
    }
  }

  return (
    [...totals.entries()]
      .filter(([, b]) => b.rated >= MIN_RATED_GAMES)
      .map(([label, b]) => ({ label, average: b.sum / b.rated, rated: b.rated }))
      // A tie goes to the larger sample, the more trustworthy of two equal
      // averages, then to the label so the order is stable across renders.
      .sort((a, b) => b.average - a.average || b.rated - a.rated || a.label.localeCompare(b.label))
  );
}

export type RankingEnds = {
  highest: RatingAverage[];
  /** The rows between the two ends, hidden until expanded. */
  middle: RatingAverage[];
  /** Empty when the whole ranking fits in `highest`. */
  lowest: RatingAverage[];
};

/** The top and bottom `size` rows of a best-first ranking, or all of it if it fits. */
export function rankingEnds(ranked: RatingAverage[], size = ENDS_SIZE): RankingEnds {
  if (ranked.length <= size * 2) return { highest: ranked, middle: [], lowest: [] };
  return {
    highest: ranked.slice(0, size),
    middle: ranked.slice(size, -size),
    lowest: ranked.slice(-size),
  };
}

/** The grade an average rounds to, for coloring its bar. */
export function nearestRating(average: number): (typeof RATINGS)[number] {
  const index = MAX_RATING_SCORE - Math.round(average);
  return RATINGS[Math.min(Math.max(index, 0), RATINGS.length - 1)];
}
