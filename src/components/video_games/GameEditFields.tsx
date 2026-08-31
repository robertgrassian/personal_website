"use client";

import { useState } from "react";
import type { Game, Rating } from "@/lib/games";
import type { WishlistGame } from "@/lib/wishlist";
import { deleteGame, promoteAndSave, saveGameEdits } from "@/app/video-games/actions";
import { ConfirmStep } from "./ConfirmStep";
import { useServerAction } from "./useServerAction";
import { RatingPicker } from "./RatingPicker";
import { SessionDateFields } from "./SessionDateFields";
import { useSessionDraft } from "./useSessionDraft";
import { buttonClass, saveButtonClass } from "./formStyles";
import { SuggestInput } from "./SuggestInput";
import { RequiredField } from "./RequiredField";

/** What these fields are editing. A wishlist entry has no library row yet, so
 *  every field below is a draft that the promote creates the row for. Both
 *  cases are deliberately the same form, differing only where a row that does
 *  not exist yet forces it: a promote cannot open a play history that has no
 *  rows, so it offers the same add form inline instead. Either way the move is
 *  not conditional on saying when you played it. */
export type EditSubject = { kind: "game"; game: Game } | { kind: "promote"; item: WishlistGame };

type GameEditFieldsProps = {
  subject: EditSubject;
  // Every system already on a shelf, for the suggestions below.
  existingSystems: string[];
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
  onOpenHistory,
  onClose,
}: GameEditFieldsProps) {
  const { isPending, error, run } = useServerAction();

  // Mirrors ConfirmStep's own step, because the sheet covers the form without
  // being able to retire it: this drives the inert region below and disables
  // Save, which the sheet sits on top of.
  const [confirmingRemove, setConfirmingRemove] = useState(false);

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
  // Save lands. An existing game logs from the play history view instead, which
  // is why this stays empty and unread there.
  const sessionDraft = useSessionDraft();
  // Behind a disclosure so the move stays one press for anyone who only wants
  // the move.
  const [addingSession, setAddingSession] = useState(false);

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
  // A promote is itself the change, so Save is live from the moment the form
  // opens — it just needs a system, which played_games requires.
  const hasChanges = promoting ? systemDraft.trim() !== "" : ratingDirty || systemDirty;
  const canSave = hasChanges && !systemMissing && sessionDraft.problem === null && !isPending;

  const save = () => {
    if (promoting) {
      // The wishlist row is gone once this lands, so the subject stops
      // existing: close rather than sit on a stale item.
      run(
        () =>
          promoteAndSave(subject.item.id, systemDraft, {
            ...(ratingDirty ? { rating: ratingDraft } : {}),
            ...(sessionDraft.value ? { session: sessionDraft.value } : {}),
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
      {/* inert while the remove confirm is up: the sheet covers this region but
          cannot make it unreachable on its own, so without this Shift+Tab lands
          in the System field behind it and a phone raises its keyboard under a
          sheet the user thinks is modal. One attribute on the region rather than
          `disabled` per control, so a field added here is covered by default.
          Save and its row are the exception: the sheet is their sibling, so it
          would go inert with them and they are disabled individually instead. */}
      <div inert={confirmingRemove}>
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
          // A promote has no row yet, so there is no history view to send it
          // to: the same add form appears inline, and Save writes the move and
          // the playthrough together. Behind a button rather than always shown,
          // because the move must not read as conditional on answering this.
          addingSession ? (
            <>
              {/* Wider gap than the other headings: this one closes the form. */}
              <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-shelf-label">
                When Did You Play It?
              </p>
              <SessionDateFields draft={sessionDraft} disabled={isPending} />
            </>
          ) : (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                // Opens with empty dates rather than dated today: a start date
                // makes the end one required, so a prefill would greet the
                // press with an error message it caused itself.
                onClick={() => setAddingSession(true)}
                disabled={isPending}
                className={buttonClass}
              >
                Add play history
              </button>
            </div>
          )
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
      </div>

      {/* Always present, so there is one place to look for "did this save?".
          Disabled until something is actually pending. */}
      <div className="mt-5 border-t border-shelf-plank pt-3">
        {/* ml-auto puts Remove at the far edge: Save is pressed constantly and
            adjacent is what a destructive control must not be.

            Nothing in here may be `relative`: the remove confirm is a sheet
            anchored to the card's own bottom edge, and a positioned ancestor
            would re-anchor it to this row. It has to stay out of flow, because
            the card sizes to its contents and would otherwise grow the whole
            case the moment the confirm opened. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!canSave || confirmingRemove}
            className={saveButtonClass}
          >
            {promoting ? "Save And Move To Library" : "Save"}
          </button>
          {!promoting && (
            <ConfirmStep
              triggerLabel="Remove from library"
              confirmLabel="Remove"
              triggerVariant="subtle"
              triggerClassName="ml-auto"
              layout="sheet"
              onConfirmingChange={setConfirmingRemove}
              onConfirm={removeGame}
              disabled={isPending}
              // The sheet covers the error line below, so a failed remove has
              // to report itself inside the sheet instead.
              error={confirmingRemove ? error : null}
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
            A game needs a console. Pick one to save.
          </p>
        )}
        {/* Under the button rather than at the foot of the panel, which is
            where it sat when the shell owned it: this is the control that
            failed, and on a long form the foot can be off screen. Suppressed
            while the remove confirm is up, which renders the same error itself:
            two live alerts would be read out twice. */}
        {error && !confirmingRemove && (
          <p role="alert" className="mt-2 text-xs text-shelf-danger">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
