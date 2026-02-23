import Image from "next/image";
import type { Game } from "@/lib/games";

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

// Tailwind classes for the colored rating dot in the card corner.
// Color-codes ratings so they're readable at a glance across the whole shelf.
const RATING_DOT: Record<string, string> = {
  Perfect: "bg-yellow-400",
  Great: "bg-green-400",
  Good: "bg-blue-400",
  Okay: "bg-amber-400",
  Bad: "bg-red-500",
};

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
  const dotColor = RATING_DOT[game.rating];
  const hasImage = game.imageUrl !== "";

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
      </div>

      {/* Rating dot — a small colored circle in the top-right corner.
          The `title` attribute adds a browser tooltip with the full rating text. */}
      {dotColor && (
        <span
          title={game.rating}
          className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${dotColor}
                     ring-1 ring-black/20 z-10`}
        />
      )}
    </div>
  );
}
