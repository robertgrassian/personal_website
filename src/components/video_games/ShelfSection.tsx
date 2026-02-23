import type { Game } from "@/lib/games";
import { GameCase } from "./GameCase";

type ShelfSectionProps = {
  label: string;
  games: Game[];
};

// ShelfSection renders one labeled shelf — a header row plus a "plank" of game cases.
export function ShelfSection({ label, games }: ShelfSectionProps) {
  return (
    <section className="mt-10">
      {/* Shelf label — small, muted, uppercase */}
      <h2 className="text-amber-200/80 text-xs font-semibold uppercase tracking-widest mb-3 px-1">
        {label}
        <span className="ml-2 text-amber-400/40 normal-case tracking-normal font-normal">
          ({games.length})
        </span>
      </h2>

      {/*
        The shelf "plank" — dark wood-tone background with a thick bottom border as the rail.
        `flex flex-wrap gap-3` lets games line up horizontally and wrap to the next row.
        The box-shadow adds depth under the rail edge, making the shelf feel 3D.
      */}
      <div
        className="bg-shelf-plank rounded-sm p-4 pb-5 border-b-4 border-shelf-edge
                   flex flex-wrap gap-3 shadow-shelf"
      >
        {games.map((game) => (
          <GameCase key={game.name + "-" + game.system} game={game} />
        ))}
      </div>
    </section>
  );
}
