"use client";

import { useOptimistic, useState } from "react";
import { localToday, systemLabel, type Game, type Rating } from "@/lib/games";
import {
  deleteGame,
  logSession,
  stopSession,
  updateGameRating,
  updateGameSystem,
} from "@/app/video-games/actions";
import { ModalShell } from "./ModalShell";
import { ConfirmStep } from "./ConfirmStep";
import { useServerAction } from "./useServerAction";
import { RatingPicker } from "./RatingPicker";
import { buttonClass, fieldClass, ghostButtonClass, labelClass } from "./formStyles";
import { SuggestInput } from "./SuggestInput";

// Date inputs size to their content rather than filling the row, so they take
// the shared tokens plus their own padding instead of `inputClass`.
const dateInputClass = `${fieldClass} px-2 py-1`;

type EditGameModalProps = {
  game: Game;
  // Every system already on a shelf, for the datalist below. Same prop
  // AddGameModal and EditWishlistModal take, from the same place.
  existingSystems: string[];
  onClose: () => void;
};

// Owner-only edit dialog, opened by the pencil on a game case. One instance
// lives in GameLibrary (like StatsPanel) rather than one per card — it exists
// only while a game is being edited, and future owner actions (sessions,
// delete) get sections here instead of fighting for space on the card.
//
// This component is mounted only while open, so the scroll-lock/Escape effect
// runs on mount and cleans up on unmount — no isOpen plumbing needed.
export function EditGameModal({ game, existingSystems, onClose }: EditGameModalProps) {
  // Optimistic rating: shows the clicked value immediately, then converges on
  // the prop once the action's revalidation delivers fresh data — including
  // reverting automatically if the server call fails.
  const [optimisticRating, setOptimisticRating] = useOptimistic<Rating | "">(game.rating);
  // isPending covers the whole write round-trip: it stays true until the
  // revalidated data lands, so session buttons stay disabled through the
  // moment the game's play state visibly updates.
  const { isPending, error, setError, run } = useServerAction();

  // Session UI state. ratePrompt = the session has just been closed and the
  // "how was it?" picker is offering a rating; logOpen = the past-session form
  // is showing.
  const [ratePrompt, setRatePrompt] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logStart, setLogStart] = useState("");
  const [logEnd, setLogEnd] = useState("");

  // Draft state, deliberately unlike the rating picker above: a rating is one
  // click of five known values, so it writes immediately and reconciles
  // optimistically. A system is free text you are halfway through typing, and
  // writing on every keystroke would file the game under "S", then "SN", then
  // "SNE". Hence a draft plus an explicit Save, the same shape the wishlist
  // notes field uses.
  const [systemDraft, setSystemDraft] = useState(game.system);

  const rate = (next: Rating | "") => {
    // Any rating write answers the "how was it?" prompt, including one made
    // with the picker at the top of the dialog — leaving it up would keep
    // asking a question that has just been answered.
    setRatePrompt(false);
    run(() => updateGameRating(game.id, next), {
      optimistic: () => setOptimisticRating(next),
    });
  };

  const startPlaying = () => {
    // Clear any leftover rating prompt from the previous playthrough.
    setRatePrompt(false);
    run(() => logSession(game.id, localToday(), null));
  };

  // "Stop playing" closes the session and nothing else. It used to only OPEN a
  // rating picker, and the write went out when you picked one of the five (or
  // found the small "Stop without rating" link) — so anyone who read "Stop
  // playing" as the action, saw the rating prompt as an optional afterthought
  // and closed the dialog had, in fact, not stopped anything. The button now
  // does what it says, and the rating became a follow-up question below.
  const stopPlaying = () => {
    const sessionId = game.openSessionId;
    if (sessionId === null) {
      // Unreachable in practice: this control only renders when `playing`
      // below has already established the id is there. But a bare `return`
      // here would be one more way for this button to silently do nothing,
      // which is the shape of problem this whole change is about.
      setError("This game has no open session to stop. Refresh the page and try again.");
      return;
    }
    run(() => stopSession(sessionId, localToday()), {
      // Only after the close lands: a prompt to rate a game whose session is
      // still open would be asking about the wrong thing.
      onSuccess: () => setRatePrompt(true),
    });
  };

  const saveLoggedSession = () => {
    if (logStart === "") return;
    // An empty end date logs a backdated session that's still going — the
    // game becomes currently playing (or a 409 if it already is).
    const end = logEnd === "" ? null : logEnd;
    run(() => logSession(game.id, logStart, end), {
      onSuccess: () => {
        setLogOpen(false);
        setLogStart("");
        setLogEnd("");
        // An end-less log opens a new session, so the branch above flips back
        // to "Stop playing" — a leftover "Finished: how was it?" underneath
        // would be asking about a game that is currently being played.
        setRatePrompt(false);
      },
    });
  };

  const saveSystem = () => {
    run(() => updateGameSystem(game.id, systemDraft));
  };

  const removeGame = () => {
    // The game is gone — close the dialog; revalidation removes the card.
    run(() => deleteGame(game.id), { onSuccess: onClose });
  };

  // `openSessionId` is always present but is null whenever nothing is open, so
  // this check is real — unlike the id guards this component used to carry.
  const playing = game.currentlyPlaying && game.openSessionId !== null;
  const logDatesInvalid = logEnd !== "" && logStart !== "" && logEnd < logStart;
  const sessionCount = game.sessionCount;
  // Compared trimmed, so trailing whitespace alone does not offer a Save that
  // would write the value the row already holds.
  const systemDirty = systemDraft.trim() !== game.system && systemDraft.trim() !== "";

  return (
    <ModalShell
      label={`Edit ${game.name}`}
      title={game.name}
      subtitle={systemLabel(game.system)}
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
          System
        </p>
        <label className={`mt-2 ${labelClass}`}>
          <span className="sr-only">Console this game is filed under</span>
          <SuggestInput
            value={systemDraft}
            onChange={setSystemDraft}
            options={existingSystems}
            maxLength={100}
            placeholder="e.g. SNES, PS5"
          />
        </label>
        {systemDirty && (
          <button
            type="button"
            onClick={saveSystem}
            disabled={isPending}
            className={`mt-2 ${buttonClass}`}
          >
            Save system
          </button>
        )}
        <p className="mt-1.5 text-[11px] text-shelf-text-muted">
          Moving a game to another console keeps its rating and play history.
        </p>

        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-shelf-label">
          Play
        </p>

        {playing ? (
          <div className="mt-2">
            <p className="text-sm text-shelf-text">
              Playing since <span className="font-medium">{game.playingSince}</span>
            </p>
            <button
              type="button"
              onClick={stopPlaying}
              disabled={isPending}
              className={`mt-2 ${buttonClass}`}
            >
              Stop playing
            </button>
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

        {/* Rendered outside the branch above, because by the time it shows the
            session is already closed and that branch has flipped to "Start
            playing" — which is itself the confirmation that the stop landed.
            Dismissing this changes nothing about the game's play state. */}
        {ratePrompt && (
          <div className="mt-3">
            <p className="text-xs text-shelf-text-muted">Finished: how was it?</p>
            {/* clearable={false}: this is a prompt, so every click should set a
                rating. Clicking the one that happens to be selected already
                would otherwise clear it, which is not what answering a question
                should do. `value` is passed so the prompt agrees with the
                picker above it rather than showing an unrated game and a rated
                one identically. */}
            <div className="mt-1.5">
              <RatingPicker
                value={optimisticRating}
                onPick={rate}
                disabled={isPending}
                clearable={false}
                describe={(name) => `Rate ${name}`}
              />
            </div>
            <button
              type="button"
              onClick={() => setRatePrompt(false)}
              className={`mt-2 ${ghostButtonClass}`}
            >
              Not now
            </button>
          </div>
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
