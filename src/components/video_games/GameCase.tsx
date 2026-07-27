"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import type { BaseGame } from "@/lib/baseGame";
import { type Rating, RATINGS } from "@/lib/games";
import { extractDominantColor } from "@/lib/dominant-color";
import { PencilIcon } from "@/components/Icon";
import { RatingIndicator } from "./RatingIndicator";
import { GameCaseBack } from "./GameCaseBack";
import { GameCaseSpine } from "./GameCaseSpine";

// View-agnostic input: Game supplies `rating` (badge); WishlistGame supplies
// `starred` (star overlay). Never both — render logic picks one. `id` is the
// DB row id from the library API; owner edits require it.
export type GameCaseInput = BaseGame & {
  id?: number;
  rating?: Rating | "";
  starred?: boolean;
};

type GameCaseProps = {
  game: GameCaseInput;
  // Provided only when the viewer owns this library — shows the pencil that
  // opens the edit dialog (the dialog itself lives in GameLibrary).
  onEdit?: () => void;
};

export function GameCase({ game, onEdit }: GameCaseProps) {
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

  // Dominant color extracted from the cover art — used for spine and back face.
  // null means not yet extracted or no image; falls back to --system-fallback from CSS.
  // isDark tracks whether the color is dark (true) or light (false) — used to pick
  // contrasting text color on the spine. Provided by fast-average-color's luminance check.
  const [dominantColor, setDominantColor] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(true);
  // Ref to the <img> element inside Next.js <Image> — needed by FastAverageColor
  // to read pixel data from the rendered image via a hidden <canvas>.
  const imageRef = useRef<HTMLImageElement>(null);

  // Extracts the dominant color once the cover image has fully loaded.
  // useCallback keeps a stable reference so it doesn't re-trigger the Image onLoad.
  // Uses getColorAsync because the image may not be fully decoded yet when onLoad fires —
  // the async version waits for decode to complete before reading pixel data.
  const handleImageLoad = useCallback(() => {
    const img = imageRef.current;
    if (!img) return;
    // Uses a shared FAC instance with a sequential queue — see src/lib/dominant-color.ts.
    // This avoids 100+ simultaneous canvas reads janking the main thread on page load.
    extractDominantColor(img)
      .then((result) => {
        setDominantColor(result.hex);
        setIsDark(result.isDark);
      })
      .catch(() => {});
  }, []);

  // Editable = the owner is viewing (onEdit provided) AND the row is
  // API-backed (has an id) AND it's a library game (wishlist entries have no
  // rating field at all — undefined, distinct from "" = unrated).
  const editable = onEdit !== undefined && game.id !== undefined && game.rating !== undefined;

  const hasImage = game.imageUrl !== "" && !imageError;
  const ratingLetter = game.rating
    ? RATINGS.find((r) => r.name === game.rating)?.letter
    : undefined;

  return (
    // Outer wrapper is intentionally non-interactive: it carries `group` (so
    // hover variants cover both the card and the pencil) and the positioning
    // context for the pencil, which must be a SIBLING of the flip button —
    // interactive elements can't nest inside a native button.
    <div className="group relative w-24 shrink-0">
      {/* Flip surface — a real button, so Enter/Space and focus semantics come
          free; Escape additionally flips back to the front.
          game-case-scene provides the perspective for the 3D flip. */}
      <button
        type="button"
        aria-pressed={flipped}
        className="game-case-scene relative block w-full cursor-pointer sm:cursor-default select-none appearance-none bg-transparent border-0 p-0 text-left
                   rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shelf-input-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--shelf-bg)]"
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && flipped) setFlipped(false);
        }}
      >
        {/* Inner container — rotates as a unit for the 3D flip.
            Hover lift is here so both faces translate together. */}
        {/* When dominantColor is set, override --system-fallback at this level.
          CSS cascading means children (spine, back face) inherit it automatically,
          no prop drilling needed — they already read var(--system-fallback). */}
        <div
          className={`game-case-inner h-36 relative
                    group-hover:-translate-y-2 group-hover:shadow-xl
                    ${flipped ? "is-flipped" : ""}`}
          style={
            dominantColor
              ? ({ "--system-fallback": dominantColor } as React.CSSProperties)
              : undefined
          }
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
                ref={imageRef}
                src={game.imageUrl}
                alt={game.name}
                fill
                className="object-cover"
                sizes="96px"
                onLoad={handleImageLoad}
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
              group-has-[:focus-visible] replaces the old group-focus-visible:
              the group wrapper is no longer focusable itself, so we react to
              keyboard focus landing on anything inside it (card or pencil). */}
            {/* z-0 is explicit: badge/ribbon at z-10 intentionally sit above this overlay */}
            <div
              className="absolute inset-0 bg-black/75 flex items-end p-2
                       transition-opacity duration-200 z-0
                       opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
            >
              <span className="text-white text-[10px] font-medium leading-tight">{game.name}</span>
            </div>

            {/* Inside front face so overflow:hidden clips. Rating badge takes
              priority over the wishlist star — a game shouldn't have both. */}
            {ratingLetter && showBadge && <RatingIndicator rank={ratingLetter} />}
            {!ratingLetter && game.starred && showBadge && (
              <div
                role="img"
                aria-label="Starred — priority wishlist pick"
                className="absolute top-1 right-1 z-10 text-xl leading-none select-none cursor-default"
                style={{
                  color: "#fde047", // tailwind yellow-300
                  textShadow: "0 1px 2px rgba(0,0,0,0.7)",
                }}
              >
                ★
              </div>
            )}
          </div>

          {/* ── Spine edges ── visible mid-rotation, connecting front and back. */}
          {/* Only pass system when there's no dominant color — otherwise the
            [data-system] selector would override the inherited --system-fallback. */}
          <GameCaseSpine
            name={game.name}
            system={dominantColor ? undefined : game.system}
            side="left"
            darkBackground={isDark}
          />
          <GameCaseSpine
            name={game.name}
            system={dominantColor ? undefined : game.system}
            side="right"
            darkBackground={isDark}
          />

          {/* ── Back face ── */}
          <div
            className="game-case-back absolute inset-0 rounded overflow-hidden shadow-lg"
            aria-hidden={!flipped}
            data-system={dominantColor ? undefined : game.system}
          >
            <GameCaseBack game={game} />
          </div>
        </div>
      </button>

      {/* Owner-only pencil → opens the edit dialog. A sibling of the flip
          button (never nested inside it), absolutely positioned over the
          card's top-left corner — the badge/star owns the top-right. It
          mirrors the card's hover lift (same 0.2s translate as
          .game-case-inner) so it moves as one with the cover, and shares the
          badge's showBadge gating so it fades out around the flip midpoint. */}
      {editable && showBadge && (
        <button
          type="button"
          aria-label={`Edit ${game.name}`}
          onClick={onEdit}
          className="absolute top-1 left-1 z-10 rounded-full bg-black/60 p-1 text-white/90
                     group-hover:-translate-y-2 transition-[translate,background-color,color] duration-200 ease-out
                     hover:bg-black/80 hover:text-white cursor-pointer
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <PencilIcon className="w-3 h-3" aria-hidden />
        </button>
      )}
    </div>
  );
}
