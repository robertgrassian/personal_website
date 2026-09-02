"use client";

import { useState } from "react";
import { localToday, type Game, type Rating } from "@/lib/games";
import type { WishlistGame } from "@/lib/wishlist";
import {
  deleteGame,
  promoteAndSave,
  saveGameEdits,
  saveGameEditsAndClearWishlist,
} from "@/app/video-games/actions";
import { ConfirmStep } from "./ConfirmStep";
import { useServerAction } from "./useServerAction";
import { RatingPicker } from "./RatingPicker";
import { PlayedFields } from "./PlayedFields";
import { GamePlayHistory } from "./GamePlayHistory";
import { StopPlayingControl } from "./StopPlayingControl";
import { usePlayDraft } from "./usePlayDraft";
import type { PlaySession } from "@/lib/sessions";
import { buttonClass, primaryButtonClass } from "./formStyles";
import { SuggestInput } from "./SuggestInput";
import { RequiredField } from "./RequiredField";

/** What these fields are editing. A wishlist entry has no library row yet, so
 *  every field below is a draft that the promote creates the row for. Both
 *  cases are deliberately the same form, and the promote's play history is the
 *  same second face, differing only in what a missing row forces: no sessions
 *  to list, and one Save that has to carry the move as well. */
export type EditSubject = { kind: "game"; game: Game } | { kind: "promote"; item: WishlistGame };

type GameEditFieldsProps = {
  subject: EditSubject;
  // Every system already on a shelf, for the suggestions below.
  existingSystems: string[];
  // Swap the card to the play history face.
  onOpenHistory: () => void;
  // Whether that swap has happened. BOTH faces are rendered from here, because
  // staying mounted is the only thing that keeps the rating, system and date
  // drafts alive across the switch, and one Save commits all of them.
  showingHistory: boolean;
  // This game's logged sessions, narrowed by the card out of the one
  // whole-library fetch. Empty for a promote, which has no row to have any.
  sessions: PlaySession[];
  sessionsLoading: boolean;
  sessionsError: string | null;
  // Arrived by "Played?", so the play choice opens answered and dated today
  // rather than neutral.
  startWithSession: boolean;
  // The wishlist entry that sent us here by "Played?", when the game was
  // already in the library. Save clears it, which is what the unowned answer to
  // the same button has always done via the promote. null in every other way
  // into this form, including opening the same game from its shelf case.
  wishlistItemId: number | null;
  // Called when a promote's Save also logged a playthrough. Same reason as the
  // add form: the library's one copy of the play history has no other way to
  // learn that the row it holds is out of date.
  onSessionLogged: () => void;
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
  showingHistory,
  sessions,
  sessionsLoading,
  sessionsError,
  startWithSession,
  wishlistItemId,
  onSessionLogged,
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

  const openSessionId = promoting ? null : subject.game.openSessionId;
  const playing = !promoting && subject.game.currentlyPlaying && openSessionId !== null;

  // Staged, not written on the press, like every other edit here. Staging the
  // stop first is also what makes a second open session legal: editCalls closes
  // before it inserts, so the 409 rule only bites while the open one is staying
  // open.
  const [stopPending, setStopPending] = useState(false);

  // The play draft for BOTH kinds. A promote has no row for a session to belong
  // to until promoteAndSave creates one, and an existing game's session is a
  // second table, so neither can ride along in the same request as the rating:
  // editCalls sequences them behind the one Save below.
  // Not when already playing: "currently playing" would be a second open
  // session, so the form would open showing its own error with Save disabled —
  // on a press whose main job is clearing the wishlist entry.
  const play = usePlayDraft({
    initialChoice: startWithSession && !playing ? "now" : "no",
    blockedByOpenSession: playing && !stopPending,
  });
  const sessionDraft = play.session;

  // The wishlist removal is itself a pending change, so Save is live from the
  // moment the form opens, exactly as it is for a promote.
  const clearingWishlist = !promoting && wishlistItemId !== null;

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
  const hasChanges = promoting
    ? systemDraft.trim() !== ""
    : clearingWishlist || ratingDirty || systemDirty || sessionDraft.dirty || stopPending;
  const canSave = hasChanges && !systemMissing && sessionDraft.problem === null && !isPending;

  const save = () => {
    if (promoting) {
      // The wishlist row is gone once this lands, so the subject stops
      // existing: close rather than sit on a stale item.
      const session = sessionDraft.value;
      run(
        () =>
          promoteAndSave(subject.item.id, systemDraft, {
            ...(ratingDirty ? { rating: ratingDraft } : {}),
            ...(session ? { session } : {}),
          }),
        {
          onSuccess: () => {
            if (session) onSessionLogged();
            onClose();
          },
        }
      );
      return;
    }

    // One press covers both faces, so a rating changed here and a playthrough
    // entered there commit together. editCalls orders them: rating and system
    // first, then the stop, then the new session.
    const session = sessionDraft.value;
    const stopping = stopPending && openSessionId !== null;
    const edits = {
      ...(ratingDirty ? { rating: ratingDraft } : {}),
      ...(systemDirty ? { system: systemDraft } : {}),
      ...(session ? { session } : {}),
      ...(stopping ? { stopSessionId: openSessionId, stopDate: localToday() } : {}),
    };
    run(
      () =>
        // Same edits either way; the wishlist variant just also deletes the row
        // that sent us here, and revalidates the wishlist for it.
        wishlistItemId === null
          ? saveGameEdits(subject.game.id, edits)
          : saveGameEditsAndClearWishlist(subject.game.id, wishlistItemId, edits),
      {
        // Stays open on either face: revalidated data flows back into
        // `subject`, so the form shows what was just saved. Only the drafts
        // with nowhere to flow back from need clearing.
        onSuccess: () => {
          play.reset();
          setStopPending(false);
          if (session || stopping) onSessionLogged();
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

  // Rendered by BOTH faces, so either one can commit and the reason a disabled
  // Save is disabled is never on the screen you just left. Remove is the one
  // part that does not follow: it belongs to the game, not to its dates, and
  // its confirm sheet names the session count of a list you would be standing
  // in front of.
  const renderSaveFooter = (showRemove: boolean) => (
    /* Always present, so there is one place to look for "did this save?".
       Disabled until something is actually pending. */
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
          className={primaryButtonClass}
        >
          {/* Named after what the press does that you cannot undo. The
              promote's wording is the sibling of this one: both answers to
              "Played?" move the entry off the wishlist. */}
          {promoting
            ? "Save And Move To Library"
            : clearingWishlist
              ? "Save And Remove From Wishlist"
              : "Save"}
        </button>
        {!promoting && showRemove && (
          <ConfirmStep
            triggerLabel="Remove from library"
            confirmLabel="Remove"
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
  );

  if (showingHistory) {
    return (
      <>
        {promoting ? (
          // A promote's history, standing in for GamePlayHistory: same headings
          // and same empty state, minus what a row that does not exist yet
          // cannot have, which is any session to list or to stop.
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-shelf-label">
              Play History
            </p>
            <p className="mt-3 text-sm text-shelf-text-muted italic">
              Nothing logged yet. Add the first one below.
            </p>
            <div className="mt-5">
              <PlayedFields play={play} label="Have you played it?" disabled={isPending} />
            </div>
          </>
        ) : (
          <GamePlayHistory
            sessions={sessions}
            isLoading={sessionsLoading}
            error={sessionsError}
            play={play}
            hasOpenSession={openSessionId !== null}
            stopPending={stopPending}
            onStopPendingChange={setStopPending}
            disabled={isPending}
          />
        )}
        {renderSaveFooter(false)}
      </>
    );
  }

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

        {/* Both kinds offer the same button, with the same label: a library
            game with nothing logged shows it too, so "view or add" is already
            what it says on an empty history. Stop Playing stages the close and
            opens the face that shows it staged. Neither writes on the press, so
            Save still owns every write. */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenHistory}
            disabled={isPending}
            className={buttonClass}
          >
            View or add play history
          </button>
          {playing && (
            <StopPlayingControl
              stopPending={stopPending}
              onChange={(pending) => {
                setStopPending(pending);
                // Staging it moves to the face that shows it beside the
                // sessions it changes. Undoing does not navigate: you are
                // already looking at the thing you undid.
                if (pending) onOpenHistory();
              }}
              disabled={isPending}
            />
          )}
        </div>
      </div>

      {renderSaveFooter(true)}
    </>
  );
}
