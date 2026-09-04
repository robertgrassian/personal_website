"use client";
import { useState, useRef, useCallback, memo } from "react";
import Image from "next/image";
import type { BaseGame } from "@/lib/baseGame";
import { type Rating, RATINGS } from "@/lib/games";
import { cachedDominantColor, extractDominantColor } from "@/lib/dominant-color";
import { RatingIndicator } from "./RatingIndicator";
import { useLibraryCard } from "./LibraryCardContext";

// View-agnostic input: Game supplies `rating` (badge); WishlistGame supplies
// `starred` (star overlay). Never both — render logic picks one. `id` is the
// DB row id from the library API; owner edits target it, and both source types
// declare it required, so it is required here too.
export type GameCaseInput = BaseGame & {
  id: number;
  rating?: Rating | "";
  starred?: boolean;
};

type GameCaseProps = {
  game: GameCaseInput;
};

function GameCaseImpl({ game }: GameCaseProps) {
  // Both read straight from context instead of arriving as props through the
  // shelf group, which stays presentational.
  const { openCard, kind } = useLibraryCard();
  // `imageError` tracks whether the cover image failed to load (broken URL, network issue, etc.).
  // When true, we fall back to the system color just as if no imageUrl were provided.
  const [imageError, setImageError] = useState(false);

  // Dominant color extracted from the cover art, handed to the detail card so
  // its background matches the cover you just clicked. null means not yet
  // extracted or no image; the card falls back to the console color.
  // Seeded from the module-level cache so a remount (the built-in shelf recuts
  // its rows on resize) keeps the colour instead of flashing back to the
  // fallback while it re-reads the canvas.
  const cached = cachedDominantColor(game.imageUrl);
  const [dominantColor, setDominantColor] = useState<string | null>(cached?.hex ?? null);
  // Whether that color is dark, which decides the spine text color on the card.
  const [isDark, setIsDark] = useState(cached?.isDark ?? true);
  // Ref to the <img> element inside Next.js <Image> — needed by FastAverageColor
  // to read pixel data from the rendered image via a hidden <canvas>.
  const imageRef = useRef<HTMLImageElement>(null);
  // The lifted inner, not the button: on hover the card sits 8px above its own
  // layout box, and that is where the flight has to start from.
  const caseRef = useRef<HTMLDivElement>(null);

  // Extracts the dominant color once the cover image has fully loaded.
  // useCallback keeps a stable reference so it doesn't re-trigger the Image onLoad.
  // Uses getColorAsync because the image may not be fully decoded yet when onLoad fires —
  // the async version waits for decode to complete before reading pixel data.
  const handleImageLoad = useCallback(() => {
    const img = imageRef.current;
    if (!img) return;
    // Uses a shared FAC instance with a sequential queue — see src/lib/dominant-color.ts.
    // This avoids 100+ simultaneous canvas reads janking the main thread on page load.
    extractDominantColor(img, game.imageUrl)
      .then((result) => {
        setDominantColor(result.hex);
        setIsDark(result.isDark);
      })
      .catch(() => {});
  }, [game.imageUrl]);

  const open = useCallback(() => {
    const el = caseRef.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    openCard(game, {
      origin: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      dominantColor,
      isDark,
    });
  }, [openCard, game, dominantColor, isDark]);

  const hasImage = game.imageUrl !== "" && !imageError;
  const ratingLetter = game.rating
    ? RATINGS.find((r) => r.name === game.rating)?.letter
    : undefined;

  return (
    // Outer wrapper carries `group` so the hover variants below cover the whole
    // card. It is non-interactive: the button inside is the whole affordance.
    <div className="group relative w-24 shrink-0">
      {/* A real button, so Enter/Space and focus semantics come free. */}
      {/* touch-action: manipulation opts this button out of double-tap-to-zoom,
          which is the only thing a browser waits on a tap to find out. Next's
          default viewport meta already earns that on iOS and Chrome, so this is
          belt-and-braces for the ones that don't.
          pointer-fine, not sm: the cursor is a pointing-device question, so a
          desktop window dragged narrower than 640px should keep the default
          arrow rather than switching to a hand. */}
      <button
        type="button"
        aria-label={`View details for ${game.name}`}
        aria-haspopup="dialog"
        data-case-id={`${kind}-${game.id}`}
        className="relative block w-full touch-manipulation cursor-pointer pointer-fine:cursor-default select-none appearance-none bg-transparent border-0 p-0 text-left
                   rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shelf-input-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--shelf-bg)]"
        onClick={open}
      >
        {/* Inner container — the hover lift, and the element the detail card's
            opening flight measures, since the lift is where the card
            visually is. */}
        <div
          ref={caseRef}
          className="game-case-inner h-36 relative group-hover:-translate-y-2 group-hover:shadow-xl"
        >
          <div
            className="absolute inset-0 rounded overflow-hidden shadow-lg"
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

            {/* Title overlay — fades in on hover/focus (desktop) or when tapped.
              group-has-[:focus-visible] replaces the old group-focus-visible:
              the group wrapper is no longer focusable itself, so we react to
              keyboard focus landing on anything inside it. */}
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
            {ratingLetter && <RatingIndicator rank={ratingLetter} />}
            {!ratingLetter && game.starred && (
              <div
                role="img"
                aria-label="Starred: priority wishlist pick"
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
        </div>
      </button>
    </div>
  );
}

// Memoized because a keystroke in the search box re-renders every visible card:
// ~155 cases, ~1,500 elements, reconciling to change nothing. It only bites now
// that the open callback comes from context — while the shelf group allocated
// a fresh `() => onEditGame(game)` per card per render, the props were never
// equal and the memo would have been dead weight. Game objects come from the
// server payload and keep a stable identity, so the default shallow comparison
// is enough.
export const GameCase = memo(GameCaseImpl);
