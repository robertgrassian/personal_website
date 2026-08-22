"use client";

import { useState } from "react";
import { localToday, type Game } from "@/lib/games";
import { formatSessionRange, sessionLengthDays, type PlaySession } from "@/lib/sessions";
import { saveGameEdits } from "@/app/video-games/actions";
import { useServerAction } from "./useServerAction";
import { SessionDateFields } from "./SessionDateFields";
import { buttonClass, ghostButtonClass, saveButtonClass } from "./formStyles";

type GamePlayHistoryProps = {
  game: Game;
  // This game's sessions, newest first. Filtered by the caller out of the one
  // whole-library fetch, so opening this view costs no extra request.
  sessions: PlaySession[];
  isLoading: boolean;
  error: string | null;
  // Arrived by answering "Played?" on a wishlist card, which has already
  // asserted the session: the dates start filled in and Save is live.
  startToday: boolean;
  // Arrived by pressing "Stop playing", which stages the close but does not
  // write it. Save is still what commits.
  startStopping: boolean;
  // Re-read the history after a successful save, so the row just written shows
  // up in the list above the form.
  onSaved: () => void;
};

// One logged session, on the card's own surface. Deliberately not
// PlayHistoryList: that one is built from the site tokens for the stats panel
// and names the game on every row, neither of which is right here, where the
// game is the card you are looking at and the tokens are the shelf's.
function SessionRow({ session }: { session: PlaySession }) {
  const days = sessionLengthDays(session);
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-shelf-plank py-2 last:border-b-0">
      <span className="min-w-0 text-sm text-shelf-text">{formatSessionRange(session)}</span>
      <span className="shrink-0 text-xs tabular-nums text-shelf-text-muted">
        {session.endDate === null ? "Playing" : days === 1 ? "1 day" : `${days} days`}
      </span>
    </li>
  );
}

// A single game's play history, and the form that adds to it. Reached from the
// button in GameEditFields, which is inside the owner-only edit region, so this
// whole view is owner-only by construction.
//
// It has its own Save rather than sharing the card's: the rating and system
// above it are edits to the game row, and these are inserts into a different
// table. One button committing both would have to explain a half-failure of two
// unrelated things.
export function GamePlayHistory({
  game,
  sessions,
  isLoading,
  error,
  startToday,
  startStopping,
  onSaved,
}: GamePlayHistoryProps) {
  const { isPending, error: saveError, run } = useServerAction();

  const openSessionId = game.openSessionId;
  const alreadyOpen = openSessionId !== null;

  const [startDate, setStartDate] = useState(startToday && !alreadyOpen ? localToday() : "");
  const [endDate, setEndDate] = useState("");
  // The explicit form of "this session has no end yet". An empty end date is
  // what actually reaches the API, but leaving a field blank is not an
  // instruction anyone can see they gave, and it read as "I haven't filled that
  // in yet" rather than "I'm still playing".
  const [stillPlaying, setStillPlaying] = useState(false);
  // Closing the open session is a pending edit like any other, not an
  // immediate write.
  const [stopPending, setStopPending] = useState(startStopping && alreadyOpen);

  const sessionDirty = startDate !== "";
  const endWithoutStart = endDate !== "" && startDate === "";
  // With the checkbox above, a blank end date is no longer a silent "still
  // playing": say which one you meant.
  const needsEnd = sessionDirty && !stillPlaying && endDate === "";
  const datesInvalid = sessionDirty && !stillPlaying && endDate !== "" && endDate < startDate;
  // A game may have only one open session (create_my_session 409s otherwise).
  // Staging the stop first is what makes "finished that run, starting another"
  // legal, and the actions layer runs the close before the insert.
  const wouldDoubleOpen = sessionDirty && stillPlaying && alreadyOpen && !stopPending;

  const problem = endWithoutStart
    ? "Add a start date, or clear the end date."
    : needsEnd
      ? "Add an end date, or tick 'I'm still playing this'."
      : datesInvalid
        ? "The end date is before the start date."
        : wouldDoubleOpen
          ? "You are already playing this. Stop playing first, or give this session an end date."
          : null;

  const hasChanges = sessionDirty || stopPending;
  const canSave = hasChanges && problem === null && !endWithoutStart && !isPending;

  const save = () => {
    run(
      () =>
        saveGameEdits(game.id, {
          ...(sessionDirty
            ? { session: { startDate, endDate: stillPlaying ? null : endDate } }
            : {}),
          ...(stopPending && openSessionId !== null
            ? { stopSessionId: openSessionId, stopDate: localToday() }
            : {}),
        }),
      {
        // Stays on this view: the point of saving here is to see the row appear
        // in the list above, so only the drafts are cleared.
        onSuccess: () => {
          setStartDate("");
          setEndDate("");
          setStillPlaying(false);
          setStopPending(false);
          onSaved();
        },
      }
    );
  };

  return (
    <>
      <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-shelf-label">
        Play History
      </p>

      {isLoading && sessions.length === 0 ? (
        <p className="mt-3 text-sm text-shelf-text-muted">Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="mt-3 text-sm text-shelf-text-muted italic">
          Nothing logged yet. Add the first one below.
        </p>
      ) : (
        <ol className="mt-2">
          {sessions.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
        </ol>
      )}
      {error !== null && (
        <p role="alert" className="mt-2 text-xs text-shelf-danger">
          {error}
        </p>
      )}

      {alreadyOpen && (
        <div className="mt-4">
          {stopPending ? (
            <p className="text-xs text-shelf-text">
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
              className={buttonClass}
            >
              Stop Playing
            </button>
          )}
        </div>
      )}

      <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-shelf-label">
        Add a Session
      </p>
      <SessionDateFields
        startDate={startDate}
        endDate={stillPlaying ? "" : endDate}
        onChangeStart={setStartDate}
        onChangeEnd={setEndDate}
        // The end date is not a thing you can answer while the checkbox says
        // there is no end yet, so the field goes with the answer.
        disabled={isPending}
        endDisabled={stillPlaying}
        problem={problem}
      />

      {/* The label wraps the input, so the whole row is the tap target; py-1.5
          is what makes that row big enough to hit on a phone.

          accent-amber-400 is a fixed value rather than the --link token on
          purpose. This sits on the card's blurred cover, which is dark in BOTH
          color schemes (see .game-card-surface), so light mode's amber-700
          would be dark-on-dark. Same reason the card's other accents are
          hard-coded light. */}
      <label className="mt-2 flex cursor-pointer items-center gap-2 py-1.5 text-sm text-shelf-text">
        <input
          type="checkbox"
          checked={stillPlaying}
          onChange={(e) => setStillPlaying(e.target.checked)}
          disabled={isPending}
          className="h-4 w-4 shrink-0 accent-amber-400 cursor-pointer disabled:cursor-default"
        />
        I&apos;m still playing this
      </label>

      <div className="mt-5 border-t border-shelf-plank pt-3">
        <button type="button" onClick={save} disabled={!canSave} className={saveButtonClass}>
          Save
        </button>
        {saveError && (
          <p role="alert" className="mt-2 text-xs text-shelf-danger">
            {saveError}
          </p>
        )}
      </div>
    </>
  );
}
