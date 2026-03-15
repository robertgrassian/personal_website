import type { Game } from "@/lib/games";
import { GameCase } from "./GameCase";

type ShelfSectionProps = {
  label: string;
  games: Game[];
};

// ShelfSection renders one shelf — an optional header row plus a "plank" of game cases.
export function ShelfSection({ label, games }: ShelfSectionProps) {
  return (
    <section className="mt-10">
      {/* Shelf label — omitted when label is empty (e.g. "group by none") */}
      {label && (
        <h2 className="text-shelf-label text-xs font-semibold uppercase tracking-widest mb-3 px-1">
          {label}
          <span className="ml-2 text-shelf-label-muted normal-case tracking-normal font-normal">
            ({games.length})
          </span>
        </h2>
      )}

      {/*
        The shelf "plank" — wood-grain background with a 3D gradient lip (via ::after in CSS).
        Grid with auto-fill 96px columns: fits as many covers as possible per row, then centers
        the entire column track area so left and right margins are equal. Items flow left-to-right,
        so partial rows remain left-aligned within the centered grid.
        Inset box-shadows and the gradient lip add depth, making the shelf feel 3D.
        Extra bottom margin (mb-2) leaves room for the ::after lip element.
      */}
      <div
        className="bg-shelf-plank shelf-plank-grain rounded-sm p-4 pb-5 mb-2
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
