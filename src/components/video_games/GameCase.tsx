import Image from "next/image";
import { type Game, type RatingLetter, RATING_LETTER } from "@/lib/games";
import { RatingRibbon } from "./RatingRibbon";
import { RatingBadge } from "./RatingBadge";

// Per-system fallback background colors shown when no cover art is available.
const SYSTEM_COLORS: Record<string, string> = {
  "Nintendo Switch": "#e60012",
  "Nintendo Switch 2": "#c0001a",
  "Nintendo GameCube": "#4a2d8f",
  "Nintendo Wii": "#5a5a5a",
  "Nintendo Wii U": "#009ac7",
  "Nintendo DS": "#ac1300",
  "Nintendo 3DS": "#cc0000",
  "Game Boy Advance": "#7c3f99",
  "Nintendo 64": "#8b4513",
  PS5: "#003087",
  PS4: "#003087",
  PS3: "#005bab",
  "Xbox 360": "#107c10",
  Xbox: "#107c10",
  Computer: "#374151",
};

// Dispatches to RatingRibbon (S) or RatingBadge (A–F), keeping GameCase agnostic of the difference.
function RatingIndicator({ rank }: { rank: RatingLetter }) {
  if (rank === "S") return <RatingRibbon />;
  return <RatingBadge rank={rank} />;
}

type GameCaseProps = {
  game: Game;
};

// No "use client" needed — Next.js propagates it down the import tree from GameLibrary.
export function GameCase({ game }: GameCaseProps) {
  const fallbackColor = SYSTEM_COLORS[game.system] ?? "#374151";
  const hasImage = game.imageUrl !== "";
  const ratingLetter: RatingLetter | undefined = game.rating
    ? RATING_LETTER[game.rating]
    : undefined;

  return (
    // `group` enables group-hover: variants on descendants; `shrink-0` prevents flex squishing.
    <div className="group relative w-24 shrink-0">
      {/* Card face — 2:3 aspect ratio (w-24 × h-36 = 96×144px) */}
      <div
        className="relative h-36 rounded overflow-hidden shadow-lg
                   transition-transform duration-200 ease-out
                   group-hover:-translate-y-2 group-hover:shadow-xl"
        style={!hasImage ? { backgroundColor: fallbackColor } : undefined}
      >
        {hasImage ? (
          // `fill` covers the parent; `sizes="96px"` tells Next.js the rendered width
          // so it serves the right optimized image size rather than a much larger file.
          <Image src={game.imageUrl} alt={game.name} fill className="object-cover" sizes="96px" />
        ) : (
          <div className="flex items-end justify-center h-full p-2">
            <span className="text-white text-[10px] font-semibold text-center leading-tight line-clamp-4">
              {game.name}
            </span>
          </div>
        )}

        {/* Title overlay — fades in on hover */}
        <div
          className="absolute inset-0 bg-black/75 flex items-end p-2
                     opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        >
          <span className="text-white text-[10px] font-medium leading-tight">{game.name}</span>
        </div>

        {/* Inside the cover div so it clips with overflow:hidden and moves with the hover translate */}
        {ratingLetter && <RatingIndicator rank={ratingLetter} />}
      </div>
    </div>
  );
}
