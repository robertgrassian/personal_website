import type { Game } from "../../lib/games.ts";
import { MAX_RATING_SCORE, RATINGS, ratingScore } from "../../lib/games.ts";

// Pure: no React. GameStats memoizes these; ratingAverages.test.ts runs them.

/** A bucket needs this many RATED games before its average is shown. */
export const MIN_RATED_GAMES = 3;

/** How many rows a dimension shows, matching the count-based "Top Genres". */
export const AVERAGE_ROW_LIMIT = 10;

export type RatingAverage = {
  label: string;
  average: number;
  /** Rated games in the bucket: the sample size, not the bucket's total. */
  rated: number;
};

/** One bucket per key a game yields. A game in two genres counts toward both. */
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
      .slice(0, AVERAGE_ROW_LIMIT)
  );
}

/** "1990s" for a 1990s release; null when the date is missing or implausible. */
export function decadeOf(releaseDate: string): string | null {
  const year = parseInt(releaseDate.slice(0, 4));
  if (isNaN(year) || year < 1970) return null;
  return `${Math.floor(year / 10) * 10}s`;
}

/** The grade an average rounds to, for coloring its bar. */
export function nearestRating(average: number): (typeof RATINGS)[number] {
  const index = MAX_RATING_SCORE - Math.round(average);
  return RATINGS[Math.min(Math.max(index, 0), RATINGS.length - 1)];
}
