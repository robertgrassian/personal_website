"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { RATINGS, type Game, type Rating } from "@/lib/games";
import { updateGameRating } from "@/app/video_games/actions";
import { CloseIcon } from "@/components/Icon";

type EditGameModalProps = {
  game: Game;
  onClose: () => void;
};

// Owner-only edit dialog, opened by the pencil on a game case. One instance
// lives in GameLibrary (like StatsPanel) rather than one per card — it exists
// only while a game is being edited, and future owner actions (sessions,
// delete) get sections here instead of fighting for space on the card.
//
// This component is mounted only while open, so the scroll-lock/Escape effect
// runs on mount and cleans up on unmount — no isOpen plumbing needed.
export function EditGameModal({ game, onClose }: EditGameModalProps) {
  // Optimistic rating: shows the clicked value immediately, then converges on
  // the prop once the action's revalidation delivers fresh data — including
  // reverting automatically if the server call fails.
  const [optimisticRating, setOptimisticRating] = useOptimistic<Rating | "">(game.rating);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Same latest-ref pattern as StatsPanel: the Escape listener reads onClose
  // through a ref so the effect never needs to re-run.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  const rate = (next: Rating | "") => {
    if (game.id === undefined) return;
    const gameId = game.id;
    startTransition(async () => {
      setError(null);
      setOptimisticRating(next);
      const result = await updateGameRating(gameId, next);
      if (!result.ok) setError(result.message);
    });
  };

  return (
    // z-50: above StatsPanel's backdrop/panel (z-30/z-40 range).
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      {/* Backdrop — clicking it closes the dialog */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${game.name}`}
        className="relative w-full max-w-sm rounded-lg border border-shelf-plank bg-shelf-bg p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-shelf-text font-semibold leading-snug">{game.name}</h2>
            <p className="text-shelf-text-muted text-xs mt-0.5">{game.system}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-shelf-text-muted hover:text-shelf-text hover:bg-shelf-input transition-colors cursor-pointer"
          >
            <CloseIcon className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-shelf-label">
          Rating
        </p>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {RATINGS.map((r) => {
            const active = r.name === optimisticRating;
            return (
              <button
                key={r.letter}
                type="button"
                aria-pressed={active}
                onClick={() => rate(active ? "" : r.name)}
                title={active ? "Remove rating" : `Rate ${r.name}`}
                className={`flex flex-col items-center gap-0.5 rounded-md border py-2 transition-colors cursor-pointer ${
                  active
                    ? "border-transparent text-black/80"
                    : "border-shelf-plank text-shelf-text hover:bg-shelf-input"
                }`}
                style={active ? { backgroundColor: r.color } : undefined}
              >
                <span
                  className="text-base font-bold leading-none"
                  style={active ? undefined : { color: r.color }}
                >
                  {r.letter}
                </span>
                <span className="text-[10px] leading-none">{r.name}</span>
              </button>
            );
          })}
        </div>

        {optimisticRating !== "" && (
          <button
            type="button"
            onClick={() => rate("")}
            className="mt-3 text-xs text-shelf-text-muted underline underline-offset-2 hover:text-shelf-text transition-colors cursor-pointer"
          >
            Remove rating
          </button>
        )}
        {/* Unrating a game removes it from the shelves (only rated games are
            shelved), which unmounts this modal — worth a heads-up. */}
        {optimisticRating === "" && (
          <p className="mt-3 text-xs text-shelf-text-muted italic">
            Unrated games leave the shelves until rated again.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 text-xs text-red-500 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
