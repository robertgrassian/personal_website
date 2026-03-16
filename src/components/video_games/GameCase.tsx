"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { type Game, RATINGS } from "@/lib/games";
import { RatingIndicator } from "./RatingIndicator";
import { GameCaseBack } from "./GameCaseBack";
import { GameCaseSpine } from "./GameCaseSpine";

type GameCaseProps = {
  game: Game;
};

export function GameCase({ game }: GameCaseProps) {
  // `flipped` drives the 3D CSS flip — true shows the metadata back face.
  const [flipped, setFlipped] = useState(false);
  // Badge disappears and reappears at the animation midpoint (300ms = half of 0.6s flip)
  // so it's not visible during the rotation.
  const [showBadge, setShowBadge] = useState(true);
  useEffect(() => {
    // Hide at midpoint when flipping away, reappear slightly earlier when flipping back.
    const delay = flipped ? 300 : 200;
    const timer = setTimeout(() => setShowBadge(!flipped), delay);
    return () => clearTimeout(timer);
  }, [flipped]);
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
    // game-case-scene provides the perspective for the 3D flip.
    // Escape key flips back to front for keyboard accessibility.
    <button
      type="button"
      className="game-case-scene group relative w-24 shrink-0 cursor-pointer sm:cursor-default select-none appearance-none bg-transparent border-0 p-0 text-left
                 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shelf-input-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--shelf-bg)]"
      onClick={() => setFlipped((f) => !f)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && flipped) setFlipped(false);
      }}
    >
      {/* Inner container — rotates as a unit for the 3D flip.
          Hover lift is here so both faces translate together. */}
      <div
        className={`game-case-inner h-36 relative
                    group-hover:-translate-y-2 group-hover:shadow-xl
                    ${flipped ? "is-flipped" : ""}`}
      >
        {/* ── Front face ── */}
        <div
          className="game-case-front absolute inset-0 rounded overflow-hidden shadow-lg"
          aria-hidden={flipped}
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

          {/* Title overlay — fades in on hover/focus (desktop) or when front is tapped.
              group-hover and group-focus-visible are CSS-driven. */}
          {/* z-0 is explicit: badge/ribbon at z-10 intentionally sit above this overlay */}
          <div
            className="absolute inset-0 bg-black/75 flex items-end p-2
                       transition-opacity duration-200 z-0
                       opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <span className="text-white text-[10px] font-medium leading-tight">{game.name}</span>
          </div>

          {/* Inside the front face so it clips with overflow:hidden */}
          {ratingLetter && showBadge && <RatingIndicator rank={ratingLetter} />}
        </div>

        {/* ── Spine edges ── visible mid-rotation, connecting front and back. */}
        <GameCaseSpine name={game.name} system={game.system} side="left" />
        <GameCaseSpine name={game.name} system={game.system} side="right" />

        {/* ── Back face ── */}
        <div
          className="game-case-back absolute inset-0 rounded overflow-hidden shadow-lg"
          aria-hidden={!flipped}
          data-system={game.system}
        >
          <GameCaseBack game={game} />
        </div>
      </div>
    </button>
  );
}
