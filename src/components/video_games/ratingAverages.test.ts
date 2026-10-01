import { test } from "node:test";
import assert from "node:assert/strict";
import type { Game, Rating } from "../../lib/games.ts";
import { decadeOf } from "../../lib/baseGame.ts";
import {
  MIN_RATED_GAMES,
  averageRatingBy,
  nearestRating,
  rankingEnds,
  type RatingAverage,
} from "./ratingAverages.ts";

// Run with `npm test`.

let nextId = 1;

function game(rating: Rating | "", fields: Partial<Game> = {}): Game {
  return {
    id: nextId++,
    name: `Game ${nextId}`,
    system: fields.system ?? "Nintendo Switch",
    genres: fields.genres ?? [],
    platforms: [],
    releaseDate: fields.releaseDate ?? "",
    imageUrl: "",
    igdbId: null,
    rating,
    lastPlayed: "",
    currentlyPlaying: false,
    playingSince: "",
    openSessionId: null,
    sessionCount: 0,
  };
}

const bySystem = (g: Game) => [g.system];
const byGenre = (g: Game) => g.genres;

test("scores S as 4 and F as 0, and averages them", () => {
  const games = [game("Perfect"), game("Bad"), game("Good")];
  assert.deepEqual(averageRatingBy(games, bySystem), [
    { label: "Nintendo Switch", average: 2, rated: 3 },
  ]);
});

test("unrated games are left out of the average and the sample size", () => {
  const games = [game("Great"), game("Great"), game("Great"), game(""), game("")];
  assert.deepEqual(averageRatingBy(games, bySystem), [
    { label: "Nintendo Switch", average: 3, rated: 3 },
  ]);
});

test(`a bucket with fewer than ${MIN_RATED_GAMES} rated games is hidden`, () => {
  const games = [
    game("Perfect", { system: "PS5" }),
    game("Perfect", { system: "PS5" }),
    game("Okay"),
    game("Okay"),
    game("Okay"),
  ];
  assert.deepEqual(
    averageRatingBy(games, bySystem).map((r) => r.label),
    ["Nintendo Switch"]
  );
});

test("a game counts toward each of its genres, once per genre", () => {
  const games = [
    game("Perfect", { genres: ["RPG", "Adventure", "RPG"] }),
    game("Good", { genres: ["RPG"] }),
    game("Good", { genres: ["RPG", "Adventure"] }),
    game("Okay", { genres: ["Adventure"] }),
  ];
  assert.deepEqual(averageRatingBy(games, byGenre), [
    { label: "RPG", average: 8 / 3, rated: 3 },
    { label: "Adventure", average: 7 / 3, rated: 3 },
  ]);
});

test("ties go to the larger sample, then alphabetically", () => {
  const four = Array.from({ length: 4 }, () => game("Good", { system: "Zed" }));
  const threeB = Array.from({ length: 3 }, () => game("Good", { system: "Bee" }));
  const threeA = Array.from({ length: 3 }, () => game("Good", { system: "Ant" }));
  assert.deepEqual(
    averageRatingBy([...threeB, ...threeA, ...four], bySystem).map((r) => r.label),
    ["Zed", "Ant", "Bee"]
  );
});

test("an empty key is dropped, and a game with no genres adds nothing", () => {
  const games = [
    ...Array.from({ length: 3 }, () => game("Good", { system: "" })),
    ...Array.from({ length: 3 }, () => game("Perfect", { genres: [] })),
  ];
  assert.deepEqual(
    averageRatingBy(games, bySystem).map((r) => r.label),
    ["Nintendo Switch"]
  );
  assert.deepEqual(averageRatingBy(games, byGenre), []);
});

test("an empty or all-unrated library has no rows", () => {
  assert.deepEqual(averageRatingBy([], bySystem), []);
  assert.deepEqual(averageRatingBy([game(""), game(""), game("")], bySystem), []);
});

// --- rankingEnds ------------------------------------------------------------

const ranked = (n: number): RatingAverage[] =>
  Array.from({ length: n }, (_, i) => ({ label: `R${i + 1}`, average: 4 - i * 0.1, rated: 3 }));
const labels = (rows: RatingAverage[]) => rows.map((r) => r.label);

test("a ranking that fits in two ends is shown whole, unsplit", () => {
  const ends = rankingEnds(ranked(10), 5);
  assert.equal(ends.highest.length, 10);
  assert.deepEqual(ends.middle, []);
  assert.deepEqual(ends.lowest, []);
});

test("a longer ranking splits into three parts that rebuild it in order", () => {
  const ends = rankingEnds(ranked(13), 5);
  assert.deepEqual(labels(ends.highest), ["R1", "R2", "R3", "R4", "R5"]);
  assert.deepEqual(labels(ends.middle), ["R6", "R7", "R8"]);
  assert.deepEqual(labels(ends.lowest), ["R9", "R10", "R11", "R12", "R13"]);
  assert.deepEqual([...ends.highest, ...ends.middle, ...ends.lowest], ranked(13));
});

test("decadeOf buckets by release year and rejects missing dates", () => {
  assert.equal(decadeOf("1998-11-21"), "1990s");
  assert.equal(decadeOf("2000"), "2000s");
  assert.equal(decadeOf("1970-01-01"), "1970s");
  assert.equal(decadeOf("1969-12-31"), null);
  assert.equal(decadeOf(""), null);
  assert.equal(decadeOf("TBA"), null);
});

test("nearestRating rounds to a grade and clamps to the scale", () => {
  assert.equal(nearestRating(4).letter, "S");
  assert.equal(nearestRating(3.4).letter, "A");
  assert.equal(nearestRating(3.5).letter, "S");
  assert.equal(nearestRating(0).letter, "F");
  assert.equal(nearestRating(-1).letter, "F");
});
