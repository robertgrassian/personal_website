// Back face of the game case — shown when the card is flipped.
// Displays game metadata in the same 96×144px footprint as the cover art.

import { type Game, RATINGS } from "@/lib/games";

// "2023-05-12" → "May 2023"
function formatDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso + "T00:00:00Z"); // Z = UTC, avoids local-timezone shift
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

type GameCaseBackProps = {
  game: Game;
};

export function GameCaseBack({ game }: GameCaseBackProps) {
  const ratingEntry = game.rating ? RATINGS.find((r) => r.name === game.rating) : undefined;

  return (
    <div className="game-case-back-surface h-full rounded flex flex-col p-2.5 text-gray-200 overflow-hidden">
      {/* Game name */}
      <p className="text-[11px] font-bold leading-tight line-clamp-2 shrink-0">{game.name}</p>
      <div className="border-t border-gray-600 my-1.5 shrink-0" />

      {/* Metadata — no labels, distinguished by styling and order */}
      <div className="flex flex-col gap-1.5 text-[10px] leading-snug min-h-0 overflow-hidden">
        {ratingEntry && (
          <p className="font-semibold" style={{ color: ratingEntry.color }}>
            ★ {ratingEntry.name}
          </p>
        )}
        <p className="font-medium">{game.system}</p>
        <p className="text-gray-400">{formatDate(game.releaseDate)}</p>
        {game.genres.length > 0 && (
          <p className="text-gray-400 line-clamp-2">{game.genres.join(", ")}</p>
        )}
      </div>
    </div>
  );
}
