"use client";

import { useState } from "react";
import { localToday, type Game, type Rating } from "@/lib/games";
import type { WishlistGame } from "@/lib/wishlist";
import { deleteGame, promoteAndSave, saveGameEdits } from "@/app/video-games/actions";
import { ConfirmStep } from "./ConfirmStep";
import { useServerAction } from "./useServerAction";
import { RatingPicker } from "./RatingPicker";
import { SessionDateFields } from "./SessionDateFields";
import { buttonClass, ghostButtonClass, saveButtonClass } from "./formStyles";
import { SuggestInput } from "./SuggestInput";
import { RequiredField } from "./RequiredField";

/** What these fields are editing. A wishlist entry has no library row yet, so
 *  every field below is a draft that the promote creates the row for. Both
 *  cases are the SAME form on purpose: moving a game to the library means you
 *  played it, and someone doing that days later may want to rate it and log the
 *  playthrough in the same press. */
export type EditSubject = { kind: "game"; game: Game } | { kind: "promote"; item: WishlistGame };

type GameEditFieldsProps = {
  subject: EditSubject;
  // Every system already on a shelf, for the suggestions below.
  existingSystems: string[];
  // Opened from the wishlist's "Played?", which is already an assertion that
  // you played it: the session fields start open and dated today, so Save is
  // live on arrival. Without this the form opened with nothing pending and a
  // dead Save, which reads as broken when you got here by answering "yes".
  startWithSession?: boolean;
  onClose: () => void;
};

// The owner's edit form for a library game. One Save commits everything:
// nothing in here reaches the database until it is pressed, which is the rule
// for every persisted edit in this directory. The per-field "Save rating" /
// "Save system" buttons this replaced meant a form could be half-committed and
// half-draft, with no way to tell by looking.
//
// Rendered inside a host that supplies the dialog chrome, so it owns its own
// error line: the two hosts place it differently and neither should have to
// thread the state back up.
export function GameEditFields({
  subject,
  existingSystems,
  startWithSession = false,
  onClose,
}: GameEditFieldsProps) {
  const { isPending, error, run } = useServerAction();

  const promoting = subject.kind === "promote";
  const source = promoting ? subject.item : subject.game;
  // A wishlist entry has no rating, so a promote starts unrated and any pick
  // counts as a change.
  const savedRating: Rating | "" = promoting ? "" : subject.game.rating;
  const savedSystem = source.system;

  const [ratingDraft, setRatingDraft] = useState<Rating | "">(savedRating);
  const [systemDraft, setSystemDraft] = useState(savedSystem);

  // Session draft. The fields are always visible; filling in a start date is
  // what makes it a pending change.
  // A game with a session already open must not have a second one staged: an
  // end-less session is an OPEN one, and create_my_session refuses a second
  // (AlreadyPlayingError). "Played?" on a game you are already playing is
  // already true, so it stages nothing and the Stop Playing control below is
  // the meaningful action.
  const alreadyOpen = subject.kind === "game" && subject.game.openSessionId !== null;
  const stageSession = startWithSession && !alreadyOpen;
  const [sessionStart, setSessionStart] = useState(stageSession ? localToday() : "");
  const [sessionEnd, setSessionEnd] = useState("");
  // Stopping is a pending edit like any other, not an immediate write.
  const [stopPending, setStopPending] = useState(false);

  const playing =
    !promoting && subject.game.currentlyPlaying && subject.game.openSessionId !== null;

  // played_games.system is NOT NULL, so this is required in BOTH modes, not
  // just on a promote. Clearing it on an existing game used to do nothing
  // visible: `systemDirty` ignores an empty value, so a Save alongside a rating
  // change would quietly keep the old console. Now it blocks Save and says so.
  const systemMissing = systemDraft.trim() === "";
  const ratingDirty = ratingDraft !== savedRating;
  // Compared trimmed, so trailing whitespace alone is not a change. Empty is
  // never a change: a game must be filed under something.
  const systemDirty = systemDraft.trim() !== savedSystem && systemDraft.trim() !== "";
  const sessionDirty = sessionStart !== "";
  // An end with no start is not "no session", it is a session whose start the
  // user has not given yet. Without this it silently vanished on Save, because
  // sessionDirty is false and nothing was ever sent.
  const endWithoutStart = sessionEnd !== "" && sessionStart === "";
  const datesInvalid =
    endWithoutStart || (sessionEnd !== "" && sessionStart !== "" && sessionEnd < sessionStart);
  // Staging an end-less (open) session while one is already open is the 409
  // above. Reachable by hand even when nothing was pre-staged.
  const wouldDoubleOpen = sessionDirty && sessionEnd === "" && alreadyOpen && !stopPending;

  // A promote is itself the change, so Save is live from the moment the form
  // opens — it just needs a system, which played_games requires.
  const hasChanges = promoting
    ? systemDraft.trim() !== ""
    : ratingDirty || systemDirty || sessionDirty || stopPending;
  const canSave = hasChanges && !systemMissing && !datesInvalid && !wouldDoubleOpen && !isPending;

  const save = () => {
    const session = sessionDirty
      ? { startDate: sessionStart, endDate: sessionEnd === "" ? null : sessionEnd }
      : undefined;

    if (promoting) {
      // The wishlist row is gone once this lands, so the subject stops
      // existing: close rather than sit on a stale item.
      run(
        () =>
          promoteAndSave(subject.item.id, systemDraft, {
            ...(ratingDirty ? { rating: ratingDraft } : {}),
            ...(session ? { session } : {}),
          }),
        { onSuccess: onClose }
      );
      return;
    }

    run(
      () =>
        saveGameEdits(subject.game.id, {
          ...(ratingDirty ? { rating: ratingDraft } : {}),
          ...(systemDirty ? { system: systemDraft } : {}),
          ...(session ? { session } : {}),
          ...(stopPending && subject.game.openSessionId !== null
            ? { stopSessionId: subject.game.openSessionId, stopDate: localToday() }
            : {}),
        }),
      {
        // Stays open: revalidated data flows back into `subject`, so the drafts
        // above converge on it and the form shows what was just saved. Only
        // the transient draft state has to be cleared by hand.
        onSuccess: () => {
          setSessionStart("");
          setSessionEnd("");
          setStopPending(false);
        },
      }
    );
  };

  const removeGame = () => {
    if (promoting) return;
    // The game is gone — close the dialog; revalidation removes the card.
    run(() => deleteGame(subject.game.id), { onSuccess: onClose });
  };

  // Same rule as the add form: the game's own platforms when we know them,
  // every shelf system otherwise.
  const systemSuggestions = source.platforms.length > 0 ? source.platforms : existingSystems;

  return (
    <>
      <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-shelf-label">
        Rating
      </p>
      <div className="mt-2">
        <RatingPicker
          variant="labeled"
          value={ratingDraft}
          onPick={setRatingDraft}
          disabled={isPending}
        />
      </div>
      {ratingDraft === "" && (
        <p className="mt-2 text-xs text-shelf-text-muted italic">
          Unrated games sit on the Unrated shelf, visible only to you.
        </p>
      )}

      <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-shelf-label">
        System
        {promoting && <span className="ml-1.5 normal-case text-shelf-text-muted">(required)</span>}
      </p>
      {/* labelHidden: the "System" heading above is the visible label, but
          the field still needs a programmatic one. Negative margin so the
          ring sits around the field without moving it. */}
      <div className="mt-2">
        <RequiredField missing={systemMissing}>
          <SuggestInput
            label="Console this game is filed under"
            labelHidden
            value={systemDraft}
            onChange={setSystemDraft}
            options={systemSuggestions}
            maxLength={100}
            placeholder="e.g. SNES, PS5"
          />
        </RequiredField>
      </div>
      <p className="mt-1.5 text-[11px] text-shelf-text-muted">
        {promoting
          ? "Which console did you play it on?"
          : "Moving a game to another console keeps its rating and play history."}
      </p>

      {playing && !promoting && (
        <div className="mt-4">
          <p className="text-sm text-shelf-text">
            Playing since <span className="font-medium">{subject.game.playingSince}</span>
          </p>
          {stopPending ? (
            <p className="mt-2 text-xs text-shelf-text">
              Will be marked finished today when you save.{" "}
              <button
                type="button"
                onClick={() => setStopPending(false)}
                disabled={isPending}
                className={ghostButtonClass}
              >
                Undo
              </button>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setStopPending(true)}
              disabled={isPending}
              className={`mt-2 ${buttonClass}`}
            >
              Stop Playing
            </button>
          )}
        </div>
      )}

      {/* A wider gap than the other section headings get: this one can follow
          the Stop Playing button, and at mt-5 the heading crowded it. */}
      <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-shelf-label">
        Track a Played Session
      </p>
      {/* Always shown rather than behind a disclosure: a session is an
          ordinary field of this form, and one fewer press to reach it.
          Empty by default, which is what keeps Save honest — pre-filling
          today here would leave every game looking like it had a pending
          change. The "Played?" path fills it in, because arriving that way
          has already asserted the session. */}
      <SessionDateFields
        startDate={sessionStart}
        endDate={sessionEnd}
        onChangeStart={setSessionStart}
        onChangeEnd={setSessionEnd}
        disabled={isPending}
        problem={
          endWithoutStart
            ? "Add a start date, or clear the end date."
            : datesInvalid
              ? "The end date is before the start date."
              : wouldDoubleOpen
                ? "You are already playing this. Add an end date, or stop playing first."
                : null
        }
      />

      {/* Always present, so there is one place to look for "did this save?".
          Disabled until something is actually pending. */}
      <div className="mt-5 border-t border-shelf-plank pt-3">
        <button type="button" onClick={save} disabled={!canSave} className={saveButtonClass}>
          {promoting ? "Save And Move To Library" : "Save"}
        </button>
        {systemMissing && (
          <p className="mt-1.5 text-[11px] text-shelf-text-muted">
            {promoting
              ? "Pick the console you played it on to save."
              : "A game needs a console. Pick one to save."}
          </p>
        )}
        {/* Under the button rather than at the foot of the panel, which is
            where it sat when the shell owned it: this is the control that
            failed, and on a long form the foot can be off screen. */}
        {error && (
          <p role="alert" className="mt-2 text-xs text-red-500 dark:text-red-400">
            {error}
          </p>
        )}
      </div>

      {!promoting && (
        <div className="mt-3 border-t border-shelf-plank pt-2">
          <ConfirmStep
            triggerLabel="Remove from library"
            confirmLabel="Remove"
            onConfirm={removeGame}
            disabled={isPending}
            prompt={
              <>
                Remove <span className="font-medium">{source.name}</span>?
                {subject.game.sessionCount > 0 && (
                  <span className="text-shelf-text-muted">
                    {" "}
                    This also deletes{" "}
                    {subject.game.sessionCount === 1
                      ? "its 1 logged session"
                      : `its ${subject.game.sessionCount} logged sessions`}
                    .
                  </span>
                )}
              </>
            }
          />
        </div>
      )}
    </>
  );
}
