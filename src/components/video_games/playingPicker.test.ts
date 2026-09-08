import { test } from "node:test";
import assert from "node:assert/strict";
import type { Game } from "../../lib/games.ts";
import { currentlyPlayingGames, startableGames } from "./playingPicker.ts";

// Run with `npm test`. No browser and no dependencies: node --test runs this
// TypeScript directly.

let nextId = 1;

/** A library row with only the fields the picker reads set by the caller. */
function game(fields: Partial<Game> & { name: string }): Game {
  return {
    id: nextId++,
    name: fields.name,
    system: fields.system ?? "Nintendo Switch",
    genres: [],
    platforms: [],
    releaseDate: "",
    imageUrl: "",
    igdbId: null,
    rating: "",
    lastPlayed: fields.lastPlayed ?? "",
    currentlyPlaying: fields.currentlyPlaying ?? false,
    playingSince: fields.playingSince ?? "",
    openSessionId: fields.openSessionId ?? null,
    sessionCount: 0,
  };
}

const names = (games: Game[]) => games.map((g) => g.name);

// --- the 409 rule ----------------------------------------------------------

test("excludes games that already have an open session", () => {
  const open = game({ name: "Hades II", currentlyPlaying: true, openSessionId: 7 });
  const closed = game({ name: "Tunic" });

  assert.deepEqual(names(startableGames([open, closed], "")), ["Tunic"]);
});

test("excludes an open session even when the query names it", () => {
  const open = game({ name: "Hades II", currentlyPlaying: true, openSessionId: 7 });

  assert.deepEqual(startableGames([open], "hades"), []);
});

// --- matching --------------------------------------------------------------

test("matching ignores case and accents, in both directions", () => {
  const games = [game({ name: "Pokémon Violet" }), game({ name: "Ōkami" })];

  assert.deepEqual(names(startableGames(games, "pokemon")), ["Pokémon Violet"]);
  assert.deepEqual(names(startableGames(games, "POKÉMON")), ["Pokémon Violet"]);
  assert.deepEqual(names(startableGames(games, "okami")), ["Ōkami"]);
});

test("matches anywhere in the name, not just the start", () => {
  const games = [game({ name: "The Legend of Zelda" })];

  assert.deepEqual(names(startableGames(games, "zelda")), ["The Legend of Zelda"]);
});

test("a whitespace-only query is treated as empty", () => {
  const games = [game({ name: "Tunic" }), game({ name: "Hades II" })];

  assert.equal(startableGames(games, "   ").length, 2);
});

// --- ordering --------------------------------------------------------------

test("most recently played first, never-played last", () => {
  const games = [
    game({ name: "Never played" }),
    game({ name: "Older", lastPlayed: "2024-01-05" }),
    game({ name: "Newer", lastPlayed: "2026-08-30" }),
  ];

  assert.deepEqual(names(startableGames(games, "")), ["Newer", "Older", "Never played"]);
});

test("ties keep their incoming order", () => {
  const games = [
    game({ name: "First", lastPlayed: "2026-01-01" }),
    game({ name: "Second", lastPlayed: "2026-01-01" }),
    game({ name: "Third", lastPlayed: "2026-01-01" }),
  ];

  assert.deepEqual(names(startableGames(games, "")), ["First", "Second", "Third"]);
});

test("does not reorder the caller's array", () => {
  const games = [
    game({ name: "Older", lastPlayed: "2024-01-05" }),
    game({ name: "Newer", lastPlayed: "2026-08-30" }),
  ];

  startableGames(games, "");

  assert.deepEqual(names(games), ["Older", "Newer"]);
});

// --- the limit -------------------------------------------------------------

test("applies the limit after ordering, so the newest survive", () => {
  const games = [
    game({ name: "Oldest", lastPlayed: "2020-01-01" }),
    game({ name: "Newest", lastPlayed: "2026-01-01" }),
    game({ name: "Middle", lastPlayed: "2023-01-01" }),
  ];

  assert.deepEqual(names(startableGames(games, "", 2)), ["Newest", "Middle"]);
});

// --- the currently-playing set ---------------------------------------------

test("keeps only in-progress games", () => {
  const games = [
    game({
      name: "Hades II",
      currentlyPlaying: true,
      playingSince: "2026-09-01",
      openSessionId: 7,
    }),
    game({ name: "Tunic", lastPlayed: "2026-08-01" }),
  ];

  assert.deepEqual(names(currentlyPlayingGames(games)), ["Hades II"]);
});

test("newest start date first, whatever order the API returned", () => {
  const games = [
    game({ name: "Oldest", currentlyPlaying: true, playingSince: "2026-01-04", openSessionId: 1 }),
    game({ name: "Newest", currentlyPlaying: true, playingSince: "2026-09-02", openSessionId: 2 }),
    game({ name: "Middle", currentlyPlaying: true, playingSince: "2026-05-20", openSessionId: 3 }),
  ];

  assert.deepEqual(names(currentlyPlayingGames(games)), ["Newest", "Middle", "Oldest"]);
});

test("a same-day tie puts the later-opened session first", () => {
  const games = [
    game({
      name: "Opened first",
      currentlyPlaying: true,
      playingSince: "2026-09-02",
      openSessionId: 4,
    }),
    game({
      name: "Opened second",
      currentlyPlaying: true,
      playingSince: "2026-09-02",
      openSessionId: 9,
    }),
  ];

  assert.deepEqual(names(currentlyPlayingGames(games)), ["Opened second", "Opened first"]);
});

test("does not reorder the caller's array", () => {
  const games = [
    game({ name: "Oldest", currentlyPlaying: true, playingSince: "2026-01-04", openSessionId: 1 }),
    game({ name: "Newest", currentlyPlaying: true, playingSince: "2026-09-02", openSessionId: 2 }),
  ];

  currentlyPlayingGames(games);

  assert.deepEqual(names(games), ["Oldest", "Newest"]);
});
