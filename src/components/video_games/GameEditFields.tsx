"use client";

import { useState } from "react";
import { localToday, type Game, type Rating } from "@/lib/games";
import type { WishlistGame } from "@/lib/wishlist";
import { deleteGame, promoteAndSave, saveGameEdits } from "@/app/video-games/actions";
import { ConfirmStep } from "./ConfirmStep";
import { useServerAction } from "./useServerAction";
import { RatingPicker } from "./RatingPicker";
import { SessionDateFields } from "./SessionDateFields";
import { buttonClass, saveButtonClass } from "./formStyles";
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
  // Opened from "Played?", which already asserts the session, so it starts
  // dated today and Save is live: arriving by answering "yes" to a dead Save
  // reads as broken. Promote only now; an owned game opens its play history.
  startWithSession?: boolean;
  // Swap the card to this game's play history. `stopping` pre-stages the
  // close, so "Stop Playing" still commits through a Save. Never on a promote,
  // which has no game row yet.
  onOpenHistory: (options: { stopping: boolean }) => void;
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
  onOpenHistory,
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

  // Session draft, PROMOTE ONLY: promoteAndSave creates the row and logs the
  // playthrough in one call, so there is no id to send a session to until this
  // Save lands. An existing game logs from the play history view instead.
  const [sessionStart, setSessionStart] = useState(
    startWithSession && promoting ? localToday() : ""
  );
  const [sessionEnd, setSessionEnd] = useState("");

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
  const sessionDirty = promoting && sessionStart !== "";
  // An end with no start is not "no session", it is a session whose start the
  // user has not given yet. Without this it silently vanished on Save, because
  // sessionDirty is false and nothing was ever sent.
  const endWithoutStart = sessionEnd !== "" && sessionStart === "";
  const datesInvalid =
    endWithoutStart || (sessionEnd !== "" && sessionStart !== "" && sessionEnd < sessionStart);
  // A promote is itself the change, so Save is live from the moment the form
  // opens — it just needs a system, which played_games requires.
  const hasChanges = promoting ? systemDraft.trim() !== "" : ratingDirty || systemDirty;
  const canSave = hasChanges && !systemMissing && !datesInvalid && !isPending;

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
        }),
      {
        // Stays open: revalidated data flows back into `subject`, so the form
        // shows what was just saved. No transient draft left to clear.
        onSuccess: () => {},
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
      {playing && (
        <p className="mt-4 text-sm text-shelf-text">
          Playing since <span className="font-medium">{subject.game.playingSince}</span>
        </p>
      )}

      {promoting ? (
        <>
          {/* Wider gap than the other headings: this one closes the form. */}
          <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-shelf-label">
            When Did You Play It?
          </p>
          {/* Inline only while promoting; see the draft state above. */}
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
                  : null
            }
          />
        </>
      ) : (
        // Both open the same view, Stop Playing with the close staged. Neither
        // writes on the press, so Save still owns every write.
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onOpenHistory({ stopping: false })}
            disabled={isPending}
            className={buttonClass}
          >
            View or add play history
          </button>
          {playing && (
            <button
              type="button"
              onClick={() => onOpenHistory({ stopping: true })}
              disabled={isPending}
              className={buttonClass}
            >
              Stop Playing
            </button>
          )}
        </div>
      )}

      {/* Always present, so there is one place to look for "did this save?".
          Disabled until something is actually pending. */}
      <div className="mt-5 border-t border-shelf-plank pt-3">
        {/* ml-auto puts Remove at the far edge: Save is pressed constantly and
            adjacent is what a destructive control must not be. flex-wrap plus
            ConfirmStep's w-full drops the prompt onto its own line. */}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} disabled={!canSave} className={saveButtonClass}>
            {promoting ? "Save And Move To Library" : "Save"}
          </button>
          {!promoting && (
            <ConfirmStep
              triggerLabel="Remove from library"
              confirmLabel="Remove"
              triggerVariant="subtle"
              triggerClassName="ml-auto"
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
          )}
        </div>
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
          <p role="alert" className="mt-2 text-xs text-shelf-danger">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
