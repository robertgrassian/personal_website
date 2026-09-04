"use client";

import type { CSSProperties } from "react";
import { GameCase } from "../GameCase";
import type { ShelfGroupProps } from "./index";
import { useShelfBoards } from "./useShelfBoards";

// One bookcase per group: its own crown, uprights and plinth, standing apart
// from the others rather than sharing one endless carcass. Each row of games
// gets its own board, because a bookcase cannot hold three rows in one bay, and
// each bay is a box: a back panel inset from the opening, the shelf floor in
// front of it, and a side wall down each edge.
//
// The name goes above the case in the page's own type rather than onto the
// furniture. Etching it into the wood was tried at three sizes and two
// positions: on the back panel, which is the darkest surface in the design, a
// cut has no value range to read against, and on the crown it costs the count
// and breaks on a group called "PC (Microsoft Windows)".
export function BuiltInGroup({ label, games }: ShelfGroupProps) {
  const { caseRef, boards, columns } = useShelfBoards(games);

  return (
    <section className="mt-6 sm:mt-9">
      {label && (
        <h2 className="shelf-case-head">
          {label}
          {/* The rule runs to the right edge, so a short group name does not
              leave the count floating in the middle of nothing. */}
          <i aria-hidden="true" />
          {/* Visually the count is a bare number beside the rule; a screen
              reader announcing "Nintendo 64, 12" needs the unit. */}
          <span>
            {games.length}
            <span className="sr-only"> {games.length === 1 ? "game" : "games"}</span>
          </span>
        </h2>
      )}

      {/* The carcass. The ref is what useShelfBoards measures to decide how
          many covers fit on a board; the track count it measured comes back
          down as a variable so the grid and the boards agree in one commit.
          Before it has measured, the CSS falls back to auto-fill. */}
      <div
        ref={caseRef}
        className="shelf-case"
        style={columns > 0 ? ({ "--shelf-cols": columns } as CSSProperties) : undefined}
      >
        <div className="shelf-crown" />
        <div className="shelf-stile shelf-stile-l" />
        <div className="shelf-stile shelf-stile-r" />

        {boards.map((board, index) => (
          // Keyed by position, not by content: a board IS "row n of this
          // case", and its games change under it on every resize.
          <div className="shelf-bay" key={index}>
            <div className="shelf-back" />
            {/* The floor and the two side walls, as flat trapezoids. There is
                no ceiling: every bay is seen from the same place, slightly
                above, so it was never visible. */}
            <div className="shelf-wall shelf-wall-l" />
            <div className="shelf-wall shelf-wall-r" />
            <div className="shelf-wall shelf-wall-f" />
            <div className="shelf-board" />
            {/* Fixed-width tracks with a fixed gap, and the whole block
                centred, so a full row leaves equal air at both uprights. */}
            <div className="shelf-row">
              {board.map((game) => (
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
