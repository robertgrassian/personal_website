"use client";

import { GameCase } from "../GameCase";
import type { ShelfGroupProps } from "./index";
import { useShelfBoards } from "./useShelfBoards";

// One bookcase per group: its own crown, uprights and plinth, standing apart
// from the others rather than sharing one endless carcass. Each row of games
// gets its own board, because a bookcase cannot hold three rows in one bay, and
// each bay is a real box — floor, ceiling, two side walls — in a perspective
// that belongs to this case alone.
//
// The name goes above the case in the page's own type rather than onto the
// furniture. Etching it into the wood was tried at three sizes and two
// positions: on the back panel, which is the darkest surface in the design, a
// cut has no value range to read against, and on the crown it costs the count
// and breaks on a group called "PC (Microsoft Windows)".
export function BuiltInGroup({ label, games }: ShelfGroupProps) {
  const { caseRef, boards } = useShelfBoards(games);

  return (
    <section className="mt-6 sm:mt-9">
      {label && (
        <h2 className="shelf-case-head">
          {label}
          {/* The rule runs to the right edge, so a short group name does not
              leave the count floating in the middle of nothing. */}
          <i aria-hidden="true" />
          <span>{games.length}</span>
        </h2>
      )}

      {/* The carcass. Its `perspective` is set by useShelfBoards from its own
          measured height. */}
      <div ref={caseRef} className="shelf-case">
        <div className="shelf-crown" />
        <div className="shelf-stile shelf-stile-l" />
        <div className="shelf-stile shelf-stile-r" />

        {boards.map((board, index) => (
          // Keyed by position, not by content: a board IS "row n of this
          // case", and its games change under it on every resize. The cases
          // inside keep their own stable keys, so re-cutting moves the same
          // DOM between boards instead of rebuilding it.
          <div className="shelf-bay" key={index}>
            <div className="shelf-back" />
            {/* Four inner faces. Each is culled by backface-visibility exactly
                when you should not be able to see it, so a bay above your eye
                shows its ceiling and one below shows its floor. */}
            <div className="shelf-wall shelf-wall-t" />
            <div className="shelf-wall shelf-wall-l" />
            <div className="shelf-wall shelf-wall-r" />
            <div className="shelf-wall shelf-wall-f" />
            <div className="shelf-board" />
            {/* data-short is what leans the last case: a row that ran out has
                nothing holding it upright. A full row must not lean, which is
                why this is the board's answer and not `:last-child` alone. */}
            <div className="shelf-row" data-short={board.isShort ? "" : undefined}>
              {board.games.map((game) => (
                <GameCase key={game.name + "-" + game.system} game={game} />
              ))}
            </div>
          </div>
        ))}

        <div className="shelf-plinth" />
      </div>
    </section>
  );
}
