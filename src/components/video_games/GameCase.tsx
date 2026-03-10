"use client";
import { useState } from "react";
import Image from "next/image";
import { type Game, type RatingLetter, RATINGS } from "@/lib/games";
import { RatingRibbon } from "./RatingRibbon";
import { RatingBadge } from "./RatingBadge";

// Dispatches to RatingRibbon (S) or RatingBadge (A–F), keeping GameCase agnostic of the difference.
function RatingIndicator({ rank }: { rank: RatingLetter }) {
  if (rank === "S") return <RatingRibbon />;
  return <RatingBadge rank={rank} />;
}

type GameCaseProps = {
  game: Game;
};

export function GameCase({ game }: GameCaseProps) {
  // Declare all state at the top before any derived values that reference them.
  // `revealed` drives tap-to-show on touch devices (no hover support).
  // On desktop, group-hover handles the overlay; onMouseLeave resets revealed so
  // clicking doesn't permanently pin the overlay open during a hover session.
  const [revealed, setRevealed] = useState(false);
  // `imageError` tracks whether the cover image failed to load (broken URL, network issue, etc.).
  // When true, we fall back to the system color just as if no imageUrl were provided.
  const [imageError, setImageError] = useState(false);

  const hasImage = game.imageUrl !== "" && !imageError;
  const ratingLetter = game.rating
    ? RATINGS.find((r) => r.name === game.rating)?.letter
    : undefined;

  return (
    // `group` enables group-hover: variants on descendants; `shrink-0` prevents flex squishing.
    // button gives keyboard (Enter/Space) support for free; appearance-none removes browser chrome.
    // cursor-pointer is scoped to mobile (sm:cursor-default) since desktop reveal is hover-driven, not click-driven.
    // onBlur resets revealed so a tapped cover doesn't stay pinned open after focus moves away.
    // focus-visible:ring provides a visible keyboard focus indicator without affecting mouse users.
    <button
      type="button"
      className="group relative w-24 shrink-0 cursor-pointer sm:cursor-default select-none appearance-none bg-transparent border-0 p-0 text-left
                 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shelf-input-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--shelf-bg)]"
      onClick={() => setRevealed((r) => !r)}
      onMouseLeave={() => setRevealed(false)}
      onBlur={() => setRevealed(false)}
    >
      {/* Card face — 2:3 aspect ratio (w-24 × h-36 = 96×144px).
          data-system is set when there's no image so the CSS [data-system="..."] rules
          in video_games.css can supply the per-console fallback background color via
          the --system-fallback custom property, without any color logic in this file. */}
      <div
        className="relative h-36 rounded overflow-hidden shadow-lg
                   transition-transform duration-200 ease-out
                   group-hover:-translate-y-2 group-hover:shadow-xl"
        data-system={!hasImage ? game.system : undefined}
        style={!hasImage ? { backgroundColor: "var(--system-fallback, #374151)" } : undefined}
      >
        {hasImage ? (
          // `fill` covers the parent; `sizes="96px"` tells Next.js the rendered width
          // so it serves the right optimized image size rather than a much larger file.
          <Image
            src={game.imageUrl}
            alt={game.name}
            fill
            className="object-cover"
            sizes="96px"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex items-end justify-center h-full p-2">
            <span className="text-white text-[10px] font-semibold text-center leading-tight line-clamp-4">
              {game.name}
            </span>
          </div>
        )}

        {/* Title overlay — fades in on hover or keyboard focus (desktop) or tap (mobile).
            group-hover and group-focus-visible are CSS-driven; revealed handles touch state.
            Separating them avoids the bug where onKeyDown fires on a focused-but-not-hovered cover. */}
        {/* z-0 is explicit: badge/ribbon at z-10 intentionally sit above this overlay */}
        <div
          className={`absolute inset-0 bg-black/75 flex items-end p-2
                     transition-opacity duration-200 z-0
                     ${revealed ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}
        >
          <span className="text-white text-[10px] font-medium leading-tight">{game.name}</span>
        </div>

        {/* Inside the cover div so it clips with overflow:hidden and moves with the hover translate */}
        {ratingLetter && <RatingIndicator rank={ratingLetter} />}
      </div>
    </button>
  );
}
