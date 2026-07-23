"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { localToday, RATINGS, type Game, type Rating } from "@/lib/games";
import { deleteGame, logSession, stopSession, updateGameRating } from "@/app/video_games/actions";
import { CloseIcon } from "@/components/Icon";
import { useModalChrome } from "./useModalChrome";

const dateInputClass =
  "bg-shelf-input border border-shelf-input-border text-shelf-input-text text-sm rounded " +
  "px-2 py-1 focus:outline-none focus:ring-1 focus:ring-shelf-input-ring";

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
  // isPending covers the whole write round-trip: it stays true until the
  // revalidated data lands, so session buttons stay disabled through the
  // moment the game's play state visibly updates.
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Session UI state. stopStep = the rate-on-stop picker is showing;
  // logOpen = the past-session form is showing.
  const [stopStep, setStopStep] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logStart, setLogStart] = useState("");
  const [logEnd, setLogEnd] = useState("");
  // deleteStep = the remove confirm (with session count) is showing.
  const [deleteStep, setDeleteStep] = useState(false);

  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Scroll lock, focus-into/restore, and Escape-to-close — shared across the
  // owner dialogs.
  useModalChrome(onClose, closeButtonRef);

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

  const startPlaying = () => {
    if (game.id === undefined) return;
    const gameId = game.id;
    // Clear any leftover rate-on-stop step from a previous playthrough (the
    // session could have been closed elsewhere while the picker was open).
    setStopStep(false);
    startTransition(async () => {
      setError(null);
      const result = await logSession(gameId, localToday(), null);
      if (!result.ok) setError(result.message);
    });
  };

  // rating: a name sets it, "" clears it, undefined keeps whatever it is —
  // all applied atomically with the close on the API side.
  const stopPlaying = (rating?: Rating | "") => {
    if (game.openSessionId == null) return;
    const sessionId = game.openSessionId;
    startTransition(async () => {
      setError(null);
      const result = await stopSession(sessionId, localToday(), rating);
      if (result.ok) setStopStep(false);
      else setError(result.message);
    });
  };

  const saveLoggedSession = () => {
    if (game.id === undefined || logStart === "") return;
    const gameId = game.id;
    // An empty end date logs a backdated session that's still going — the
    // game becomes currently playing (or a 409 if it already is).
    const end = logEnd === "" ? null : logEnd;
    startTransition(async () => {
      setError(null);
      const result = await logSession(gameId, logStart, end);
      if (result.ok) {
        setLogOpen(false);
        setLogStart("");
        setLogEnd("");
      } else {
        setError(result.message);
      }
    });
  };

  const removeGame = () => {
    if (game.id === undefined) return;
    const gameId = game.id;
    startTransition(async () => {
      setError(null);
      const result = await deleteGame(gameId);
      // The game is gone — close the dialog; revalidation removes the card.
      if (result.ok) onClose();
      else setError(result.message);
    });
  };

  const playing = game.currentlyPlaying && game.openSessionId != null;
  const logDatesInvalid = logEnd !== "" && logStart !== "" && logEnd < logStart;
  const sessionCount = game.sessionCount ?? 0;

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
        {optimisticRating === "" && (
          <p className="mt-3 text-xs text-shelf-text-muted italic">
            Unrated games move to the Unrated shelf (visible only to you) until rated again.
          </p>
        )}

        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-shelf-label">
          Play
        </p>

        {playing ? (
          <div className="mt-2">
            <p className="text-sm text-shelf-text">
              Playing since <span className="font-medium">{game.playingSince}</span>
            </p>
            {!stopStep ? (
              <button
                type="button"
                onClick={() => setStopStep(true)}
                disabled={isPending}
                className="mt-2 rounded-md border border-shelf-plank px-3 py-1.5 text-sm text-shelf-text hover:bg-shelf-input transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
              >
                Stop playing
              </button>
            ) : (
              <div className="mt-2">
                <p className="text-xs text-shelf-text-muted">Finished — how was it?</p>
                <div className="mt-1.5 grid grid-cols-5 gap-1.5">
                  {RATINGS.map((r) => (
                    <button
                      key={r.letter}
                      type="button"
                      onClick={() => stopPlaying(r.name)}
                      disabled={isPending}
                      title={`Stop and rate ${r.name}`}
                      aria-label={`Stop and rate ${r.name}`}
                      className="rounded-md border border-shelf-plank py-1.5 text-sm font-bold hover:bg-shelf-input transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
                      style={{ color: r.color }}
                    >
                      {r.letter}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-4">
                  <button
                    type="button"
                    onClick={() => stopPlaying(undefined)}
                    disabled={isPending}
                    className="text-xs text-shelf-text-muted underline underline-offset-2 hover:text-shelf-text transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {game.rating !== "" ? `Stop, keep "${game.rating}"` : "Stop without rating"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStopStep(false)}
                    disabled={isPending}
                    className="text-xs text-shelf-text-muted underline underline-offset-2 hover:text-shelf-text transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={startPlaying}
            disabled={isPending}
            className="mt-2 rounded-md border border-shelf-plank px-3 py-1.5 text-sm text-shelf-text hover:bg-shelf-input transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            Start playing
          </button>
        )}

        <button
          type="button"
          onClick={() => setLogOpen((open) => !open)}
          aria-expanded={logOpen}
          className="mt-3 block text-xs text-shelf-text-muted underline underline-offset-2 hover:text-shelf-text transition-colors cursor-pointer"
        >
          Log a past session
        </button>
        {logOpen && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-shelf-label">
              From
              <input
                type="date"
                value={logStart}
                max={localToday()}
                onChange={(e) => setLogStart(e.target.value)}
                className={dateInputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-shelf-label">
              To
              <input
                type="date"
                value={logEnd}
                min={logStart || undefined}
                max={localToday()}
                onChange={(e) => setLogEnd(e.target.value)}
                className={dateInputClass}
              />
            </label>
            <button
              type="button"
              onClick={saveLoggedSession}
              disabled={isPending || logStart === "" || logDatesInvalid}
              className="rounded-md border border-shelf-plank px-3 py-1.5 text-sm text-shelf-text hover:bg-shelf-input transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
            >
              Save
            </button>
            <p className="w-full text-[11px] text-shelf-text-muted">
              Leave “To” empty if you’re still playing it.
            </p>
          </div>
        )}

        <div className="mt-5 border-t border-shelf-plank pt-3">
          {!deleteStep ? (
            <button
              type="button"
              onClick={() => setDeleteStep(true)}
              disabled={isPending}
              className="text-xs text-red-600 dark:text-red-400 underline underline-offset-2 hover:opacity-80 transition-opacity cursor-pointer disabled:opacity-50"
            >
              Remove from library
            </button>
          ) : (
            <div>
              <p className="text-sm text-shelf-text">
                Remove <span className="font-medium">{game.name}</span>?
                {sessionCount > 0 && (
                  <span className="text-shelf-text-muted">
                    {" "}
                    This also deletes{" "}
                    {sessionCount === 1
                      ? "its 1 logged session"
                      : `its ${sessionCount} logged sessions`}
                    .
                  </span>
                )}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={removeGame}
                  disabled={isPending}
                  className="rounded-md border border-red-600/50 dark:border-red-400/50 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-600/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteStep(false)}
                  disabled={isPending}
                  className="rounded-md border border-shelf-plank px-3 py-1.5 text-sm text-shelf-text hover:bg-shelf-input transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-xs text-red-500 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
