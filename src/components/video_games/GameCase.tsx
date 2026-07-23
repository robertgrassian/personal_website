"use client";
import { useState, useEffect, useRef, useCallback, useOptimistic, useTransition } from "react";
import Image from "next/image";
import type { BaseGame } from "@/lib/baseGame";
import { type Rating, RATINGS } from "@/lib/games";
import { extractDominantColor } from "@/lib/dominant-color";
import { updateGameRating } from "@/app/video_games/actions";
import { RatingIndicator } from "./RatingIndicator";
import { GameCaseBack } from "./GameCaseBack";
import { GameCaseSpine } from "./GameCaseSpine";

// View-agnostic input: Game supplies `rating` (badge); WishlistGame supplies
// `starred` (star overlay). Never both — render logic picks one. `id` is the
// DB row id (absent on CSV-sourced games); owner edits require it.
export type GameCaseInput = BaseGame & {
  id?: number;
  rating?: Rating | "";
  starred?: boolean;
};

type GameCaseProps = {
  game: GameCaseInput;
  // True only for the library owner (resolved client-side after hydration).
  // Turns on the rating editor on the back face when the game is editable.
  canEdit?: boolean;
};

export function GameCase({ game, canEdit = false }: GameCaseProps) {
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

  // Optimistic rating: shows the clicked value immediately, then settles on
  // whatever the server sends back. useOptimistic pins its state to the base
  // value (the `game.rating` prop) whenever no transition is pending — so
  // after the action completes and revalidation delivers fresh props, this
  // converges to the server's truth automatically, including reverting a
  // failed update without any manual rollback code.
  const [optimisticRating, setOptimisticRating] = useOptimistic<Rating | "">(game.rating ?? "");
  const [, startTransition] = useTransition();
  const [rateError, setRateError] = useState<string | null>(null);

  const handleRate = (next: Rating | "") => {
    const gameId = game.id;
    if (gameId === undefined) return;
    // Optimistic updates must happen inside the same transition as the async
    // action — React ties the optimistic value's lifetime to the transition.
    startTransition(async () => {
      setRateError(null);
      setOptimisticRating(next);
      const result = await updateGameRating(gameId, next);
      if (!result.ok) setRateError(result.message);
    });
  };

  // What the badge and back face display. Wishlist entries have no rating at
  // all (undefined, distinct from "" = unrated) and are never editable here.
  const displayRating = game.rating !== undefined ? optimisticRating : undefined;
  const editable = canEdit && game.id !== undefined && game.rating !== undefined;

  const hasImage = game.imageUrl !== "" && !imageError;
  const ratingLetter = displayRating
    ? RATINGS.find((r) => r.name === displayRating)?.letter
    : undefined;

  return (
    // `group` enables group-hover: variants on descendants; `shrink-0` prevents flex squishing.
    // game-case-scene provides the perspective for the 3D flip.
    //
    // div[role="button"] instead of <button>: the back face contains real
    // <button>s (the rating editor), and interactive elements can't nest
    // inside a native button (invalid HTML, broken semantics). The div
    // re-implements what button gave for free: tabIndex for focus, and
    // Enter/Space handling below (preventDefault stops Space scrolling the
    // page). Escape still flips back to the front.
    <div
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      className="game-case-scene group relative w-24 shrink-0 cursor-pointer sm:cursor-default select-none text-left
                 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shelf-input-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--shelf-bg)]"
      onClick={() => setFlipped((f) => !f)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setFlipped((f) => !f);
        } else if (e.key === "Escape" && flipped) {
          setFlipped(false);
        }
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
              group-hover and group-focus-visible are CSS-driven. */}
          {/* z-0 is explicit: badge/ribbon at z-10 intentionally sit above this overlay */}
          <div
            className="absolute inset-0 bg-black/75 flex items-end p-2
                       transition-opacity duration-200 z-0
                       opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
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
          {/* Spread + override so the back face shows the optimistic rating,
              not the (possibly stale) prop, while an update is in flight. */}
          <GameCaseBack
            game={{ ...game, rating: displayRating }}
            onRate={editable ? handleRate : undefined}
            rateError={rateError}
          />
        </div>
      </div>
    </div>
  );
}
