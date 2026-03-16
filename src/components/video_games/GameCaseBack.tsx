// Back face of the game case — shown when the card is flipped.
// Displays game metadata in the same 96×144px footprint as the cover art.

import { type Game, RATINGS, RATING_COLORS } from "@/lib/games";

// "2023-05-12" → "May 2023"
function formatDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso + "T00:00:00"); // avoid timezone shift
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

type GameCaseBackProps = {
  game: Game;
};

export function GameCaseBack({ game }: GameCaseBackProps) {
  const ratingEntry = game.rating ? RATINGS.find((r) => r.name === game.rating) : undefined;
  const ratingColor = ratingEntry ? (RATING_COLORS[ratingEntry.letter] ?? "#e5e7eb") : undefined;

  return (
    <div className="game-case-back-surface h-full rounded flex flex-col justify-between p-2 text-gray-200">
      {/* Game name */}
      <div>
        <p className="text-[10px] font-bold leading-tight line-clamp-3">{game.name}</p>
        <div className="border-t border-gray-600 my-1" />
      </div>

      {/* Metadata rows */}
      <div className="flex flex-col gap-0.5 text-[9px] leading-snug flex-1">
        {ratingEntry && (
          <p>
            <span className="text-gray-400">★</span>{" "}
            <span style={{ color: ratingColor }}>{ratingEntry.name}</span>
          </p>
        )}
        <p>
          <span className="text-gray-400">🎮</span> {game.system}
        </p>
        <p>
          <span className="text-gray-400">📅</span> {formatDate(game.releaseDate)}
        </p>
        <p>
          <span className="text-gray-400">▶</span> {game.firstPlayed || "—"}
        </p>
      </div>

      {/* Genres at the bottom */}
      {game.genres.length > 0 && (
        <p className="text-[8px] text-gray-400 leading-tight mt-1 line-clamp-2">
          {game.genres.join(" · ")}
        </p>
      )}
    </div>
  );
}
