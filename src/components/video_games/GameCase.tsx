import Image from "next/image";
import type { Game } from "@/lib/games";
import { RatingRibbon } from "./RatingRibbon";
import { RatingBadge } from "./RatingBadge";

// Per-system fallback background colors shown when no cover art is available.
// These loosely match each system's brand color palette.
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

// Maps the game's stored rating string to an S/A/B/C/F display letter.
// The underlying data (games.csv and the Game type) does not change.
type RatingLetter = "S" | "A" | "B" | "C" | "F";
const RATING_LETTER: Record<string, RatingLetter> = {
  Perfect: "S",
  Great: "A",
  Good: "B",
  Okay: "C",
  Bad: "F",
};

// Renders the appropriate rating widget for any rank, keeping GameCase
// agnostic of the S vs non-S distinction.
function RatingIndicator({ rank }: { rank: RatingLetter }) {
  if (rank === "S") return <RatingRibbon />;
  return <RatingBadge rank={rank} />;
}

type GameCaseProps = {
  game: Game;
};

// GameCase renders a single game "case" card
// It has no state or browser APIs, so it doesn't need "use client".
// When imported by GameLibrary (which has "use client"), it runs on the client automatically.
// This is a key Next.js concept: "use client" propagates down the import tree — you only
// need the directive on the outermost component that introduces interactivity.
export function GameCase({ game }: GameCaseProps) {
  const fallbackColor = SYSTEM_COLORS[game.system] ?? "#374151";
  const hasImage = game.imageUrl !== "";
  const ratingLetter: RatingLetter | undefined = RATING_LETTER[game.rating];

  return (
    // The outer div is the full game case — tall and narrow.
    // `group` enables Tailwind's group-hover: variants on descendant elements.
    // `shrink-0` prevents flex from squishing cards below their specified width.
    <div className="group relative w-24 shrink-0">
      {/* The card face — 2:3 aspect ratio (96px wide × 144px tall = w-24 × h-36) */}
      <div
        className="relative h-36 rounded overflow-hidden shadow-lg
                   transition-transform duration-200 ease-out
                   group-hover:-translate-y-2 group-hover:shadow-xl"
        style={!hasImage ? { backgroundColor: fallbackColor } : undefined}
      >
        {hasImage ? (
          // Next.js <Image> with fill=true makes the image cover the parent container.
          // The parent needs position:relative — provided by the "relative" Tailwind class.
          // sizes="96px" tells Next.js the actual rendered width so it serves the right
          // optimized size from its image pipeline. Without this, it serves a much larger file.
          <Image src={game.imageUrl} alt={game.name} fill className="object-cover" sizes="96px" />
        ) : (
          // Fallback: system-colored card with the title text at the bottom.
          <div className="flex items-end justify-center h-full p-2">
            <span className="text-white text-[10px] font-semibold text-center leading-tight line-clamp-4">
              {game.name}
            </span>
          </div>
        )}

        {/* Title overlay — fades in on hover, sits on top of the cover or fallback */}
        <div
          className="absolute inset-0 bg-black/75 flex items-end p-2
                     opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        >
          <span className="text-white text-[10px] font-medium leading-tight">{game.name}</span>
        </div>

        {/* Rating indicator — inside the cover div so it clips with overflow:hidden
            and translates with the card on hover. z-index:10 keeps it above the
            hover overlay, which has no explicit z-index. */}
        {ratingLetter && <RatingIndicator rank={ratingLetter} />}
      </div>
    </div>
  );
}
