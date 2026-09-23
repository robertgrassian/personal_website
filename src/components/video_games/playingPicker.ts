import type { Game } from "@/lib/games";
// The .ts extension is required, not stylistic: node --test loads this module
// for playingPicker.test.ts and resolves real paths, so an extensionless
// relative import fails there. tsconfig's allowImportingTsExtensions covers it.
import { compareIso, foldForSearch, foldedName } from "./textMatch.ts";

// The two sides of the "currently playing" set: which games are on it, and
// which library games the panel offers as a next session.
//
// Pure and in its own module so it can be tested: `npm test` runs node --test
// with no DOM, so the panel's rendering is out of reach but this is not.

/** How many candidates the picker shows at once. */
export const PICKER_LIMIT = 20;

// The in-progress set, newest session first. Every surface showing it goes
// through here: the CRT's channel order, its pips, and the panel's "in
// progress" list are one order, not three.
//
// The API returns the library in insertion order (PlayedGame.id, see
// api/app/repositories/users.py), which for this list means "whichever game
// you happened to add first", so the order has to be imposed on the client.
export function currentlyPlayingGames(games: Game[]): Game[] {
  return (
    games
      .filter((game) => game.currentlyPlaying)
      // No `|| "0000"` guard as in startableGames below: playingSince is the
      // open session's start date, so a currentlyPlaying game always has one.
      // The open session id breaks a same-day tie, which is the tiebreak
      // derive_play_state already uses to pick that session (services/users.py).
      .sort(
        (a, b) =>
          compareIso(b.playingSince, a.playingSince) ||
          (b.openSessionId ?? 0) - (a.openSessionId ?? 0)
      )
  );
}

export function startableGames(games: Game[], query: string, limit = PICKER_LIMIT): Game[] {
  const needle = foldForSearch(query.trim());

  return (
    games
      // A game with an open session cannot take another: the API answers 409
      // (api/tests/test_me_api.py::test_second_open_session_is_409). Offering
      // it here would turn a tap into an error message.
      .filter((game) => !game.currentlyPlaying)
      .filter((game) => needle === "" || foldedName(game).includes(needle))
      // Most recently finished first, so an empty query opens on what you are
      // most likely to pick back up. The || "0000" sinks never-played games to
      // the bottom of a descending sort rather than the top.
      .sort((a, b) => compareIso(b.lastPlayed || "0000", a.lastPlayed || "0000"))
      .slice(0, limit)
  );
}
