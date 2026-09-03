import { GameCase } from "../GameCase";
import type { ShelfGroupProps } from "./index";

// The shelf this site shipped for a year, with the wood taken off: one plank
// per group and a wrapping grid of covers. Purely presentational — whether a
// card is editable is read from LibraryCardContext by GameCase itself.
//
// This is a server component on purpose. It measures nothing and owns no state,
// which is most of why it stays the right answer on a phone: the whole group
// arrives in the prerendered HTML with nothing to settle after hydration.
export function PlainGroup({ label, games }: ShelfGroupProps) {
  return (
    // Halved on phones. This gap repeats between every group, not just above
    // the first, so it is the one trim here that keeps paying as you scroll.
    <section className="mt-5 sm:mt-10">
      {/* Omitted when label is empty (e.g. "group by none") */}
      {label && (
        <h2 className="text-shelf-label text-xs font-semibold uppercase tracking-widest mb-3 px-1">
          {label}
          <span className="ml-2 text-shelf-label-muted normal-case tracking-normal font-normal">
            ({games.length})
          </span>
        </h2>
      )}

      {/*
        Grid with auto-fill 96px columns: fits as many covers as possible per row, then centers
        the entire column track area so left and right margins are equal. Items flow left-to-right,
        so partial rows remain left-aligned within the centered grid.
        The plank's own depth (the lip under it, the inset shading) is in
        shelf-themes.css under .shelf-plain-plank.
      */}
      <div
        className="shelf-plain-plank bg-shelf-surface rounded-sm p-4 pb-5 mb-2
                   grid gap-3 justify-center"
        style={{ gridTemplateColumns: "repeat(auto-fill, 96px)" }}
      >
        {games.map((game) => (
          <GameCase key={game.name + "-" + game.system} game={game} />
        ))}
      </div>
    </section>
  );
}
