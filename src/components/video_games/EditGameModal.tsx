"use client";

import { useOptimistic, useState } from "react";
import { localToday, type Game, type Rating } from "@/lib/games";
import { deleteGame, logSession, stopSession, updateGameRating } from "@/app/video-games/actions";
import { ModalShell } from "./ModalShell";
import { ConfirmStep } from "./ConfirmStep";
import { useServerAction } from "./useServerAction";
import { RatingPicker } from "./RatingPicker";
import { buttonClass, fieldClass, ghostButtonClass, labelClass } from "./formStyles";

// Date inputs size to their content rather than filling the row, so they take
// the shared tokens plus their own padding instead of `inputClass`.
const dateInputClass = `${fieldClass} px-2 py-1`;

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
  const { isPending, error, run } = useServerAction();

  // Session UI state. stopStep = the rate-on-stop picker is showing;
  // logOpen = the past-session form is showing.
  const [stopStep, setStopStep] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logStart, setLogStart] = useState("");
  const [logEnd, setLogEnd] = useState("");

  const rate = (next: Rating | "") => {
    const gameId = game.id;
    if (gameId === undefined) return;
    run(() => updateGameRating(gameId, next), {
      optimistic: () => setOptimisticRating(next),
    });
  };

  const startPlaying = () => {
    const gameId = game.id;
    if (gameId === undefined) return;
    // Clear any leftover rate-on-stop step from a previous playthrough (the
    // session could have been closed elsewhere while the picker was open).
    setStopStep(false);
    run(() => logSession(gameId, localToday(), null));
  };

  // rating: a name sets it, "" clears it, undefined keeps whatever it is —
  // all applied atomically with the close on the API side.
  const stopPlaying = (rating?: Rating | "") => {
    const sessionId = game.openSessionId;
    if (sessionId == null) return;
    run(() => stopSession(sessionId, localToday(), rating), {
      onSuccess: () => setStopStep(false),
    });
  };

  const saveLoggedSession = () => {
    const gameId = game.id;
    if (gameId === undefined || logStart === "") return;
    // An empty end date logs a backdated session that's still going — the
    // game becomes currently playing (or a 409 if it already is).
    const end = logEnd === "" ? null : logEnd;
    run(() => logSession(gameId, logStart, end), {
      onSuccess: () => {
        setLogOpen(false);
        setLogStart("");
        setLogEnd("");
      },
    });
  };

  const removeGame = () => {
    const gameId = game.id;
    if (gameId === undefined) return;
    // The game is gone — close the dialog; revalidation removes the card.
    run(() => deleteGame(gameId), { onSuccess: onClose });
  };

  const playing = game.currentlyPlaying && game.openSessionId != null;
  const logDatesInvalid = logEnd !== "" && logStart !== "" && logEnd < logStart;
  const sessionCount = game.sessionCount ?? 0;

  return (
    <ModalShell
      label={`Edit ${game.name}`}
      title={game.name}
      subtitle={game.system}
      onClose={onClose}
      error={error}
    >
      <>
        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-shelf-label">
          Rating
        </p>
        <div className="mt-2">
          <RatingPicker variant="labeled" value={optimisticRating} onPick={rate} />
        </div>

        {optimisticRating !== "" && (
          <button type="button" onClick={() => rate("")} className={`mt-3 ${ghostButtonClass}`}>
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
                className={`mt-2 ${buttonClass}`}
              >
                Stop playing
              </button>
            ) : (
              <div className="mt-2">
                <p className="text-xs text-shelf-text-muted">Finished: how was it?</p>
                {/* No `value`, and clearable={false}: these five are actions
                    that close the session AND set a rating, not a toggle over a
                    current one. Leaving value unset keeps every button
                    unselected, so the game's existing rating never renders as
                    "already chosen" here — picking it again would still be a
                    meaningful click. */}
                <div className="mt-1.5">
                  <RatingPicker
                    onPick={(r) => stopPlaying(r as Rating)}
                    disabled={isPending}
                    clearable={false}
                    describe={(name) => `Stop and rate ${name}`}
                  />
                </div>
                <div className="mt-2 flex gap-4">
                  <button
                    type="button"
                    onClick={() => stopPlaying(undefined)}
                    disabled={isPending}
                    className={ghostButtonClass}
                  >
                    {game.rating !== "" ? `Stop, keep "${game.rating}"` : "Stop without rating"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStopStep(false)}
                    disabled={isPending}
                    className={ghostButtonClass}
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
            className={`mt-2 ${buttonClass}`}
          >
            Start playing
          </button>
        )}

        <button
          type="button"
          onClick={() => setLogOpen((open) => !open)}
          aria-expanded={logOpen}
          className={`mt-3 block ${ghostButtonClass}`}
        >
          Log a past session
        </button>
        {logOpen && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className={labelClass}>
              From
              <input
                type="date"
                value={logStart}
                max={localToday()}
                onChange={(e) => setLogStart(e.target.value)}
                className={dateInputClass}
              />
            </label>
            <label className={labelClass}>
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
              className={buttonClass}
            >
              Save
            </button>
            <p className="w-full text-[11px] text-shelf-text-muted">
              Leave “To” empty if you’re still playing it.
            </p>
          </div>
        )}

        <div className="mt-5 border-t border-shelf-plank pt-3">
          <ConfirmStep
            triggerLabel="Remove from library"
            confirmLabel="Remove"
            onConfirm={removeGame}
            disabled={isPending}
            prompt={
              <>
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
              </>
            }
          />
        </div>
      </>
    </ModalShell>
  );
}
