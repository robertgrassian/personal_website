// Text matching and cheap ordering for the library's search and sort paths.
//
// A leaf module on purpose: its only import is a type, so `node --test` can
// load it directly. pipeline.ts pulls in RATINGS at runtime through the "@/"
// alias, which node does not resolve, so anything that lives there is out of
// reach of the suite. Re-exported from pipeline.ts, which stays the import
// site every caller already knows.

import type { BaseGame } from "@/lib/baseGame";

// Ordering for strings that are fixed-width ASCII (ISO dates, "1990s"), where
// byte order and collation order agree. Roughly 10x cheaper per comparison than
// full ICU collation, which is why the date sorts do not use Intl.Collator.
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

export function foldedName(game: BaseGame): string {
  const cached = foldedNames.get(game);
  if (cached !== undefined) return cached;
  const folded = foldForSearch(game.name);
  foldedNames.set(game, folded);
  return folded;
}
