// Back face of the game case — shown when the card is flipped.
// Layers: dominant color base → blurred cover art → dark overlay → text.
// The blurred cover gives a physical, textured feel (like real box art wrapping
// around to the back) while the overlay keeps text readable.

import Image from "next/image";
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
  const hasImage = game.imageUrl !== "";

  return (
    // Relative container — layers stack via absolute positioning.
    // Base background is --system-fallback (dominant color or console color),
    // visible as a tint underneath the blurred image.
    <div className="game-case-back-surface relative h-full rounded overflow-hidden">
      {/* Layer 1: Blurred cover art — gives texture and color variation.
          scale-110 prevents blur from showing transparent edges at the borders. */}
      {hasImage && (
        <Image
          src={game.imageUrl}
          alt=""
          fill
          aria-hidden
          className="object-cover scale-110 blur-[8px] opacity-60 dark:opacity-55"
          sizes="96px"
        />
      )}

      {/* Layer 2: Dark overlay — ensures text contrast over the blurred image.
          Lighter than the old full overlay so the artwork shows through. */}
      <div className="absolute inset-0 bg-black/25 dark:bg-black/35" />

      {/* Layer 3: Text content — sits above all background layers. */}
      <div className="relative z-10 h-full flex flex-col p-2.5 text-gray-200">
        {/* Game name */}
        <p className="text-[11px] font-bold leading-tight line-clamp-2 shrink-0">{game.name}</p>
        <div className="border-t border-white/20 my-1.5 shrink-0" />

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
    </div>
  );
}
