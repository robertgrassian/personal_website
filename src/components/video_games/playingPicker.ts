import type { Game } from "@/lib/games";
// The .ts extension is required, not stylistic: node --test loads this module
// for playingPicker.test.ts and resolves real paths, so an extensionless
// relative import fails there. tsconfig's allowImportingTsExtensions covers it.
import { compareIso, foldForSearch, foldedName } from "./textMatch.ts";

// Which library games the "currently playing" panel offers as a next session.
//
// Pure and in its own module so it can be tested: `npm test` runs node --test
// with no DOM, so the panel's rendering is out of reach but this is not.

/** How many candidates the picker shows at once. */
export const PICKER_LIMIT = 20;

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
