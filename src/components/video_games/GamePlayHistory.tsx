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
  // Newest first, narrowed by the caller out of the one whole-library fetch,
  // so opening this view costs no extra request.
  sessions: PlaySession[];
  isLoading: boolean;
  error: string | null;
  // Arrived by "Played?", which already asserts the session: dates start
  // filled and Save is live.
  startToday: boolean;
  // Arrived by "Stop playing", which stages the close. Save still commits it.
  startStopping: boolean;
  // Re-read after a save, so the new row appears in the list above.
  onSaved: () => void;
};

// One logged session, on the card's scrim. Not PlayHistoryList: that one uses
// site tokens and names the game on every row.
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

// A single game's play history, and the form that adds to it. Reached only from
// GameEditFields' owner-only region, so it needs no permission check.
//
// Its own Save, not the card's: rating and system edit the game row, these
// insert into another table, and one button would have to explain a half
// failure of two unrelated things.
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
  // The explicit form of "no end yet". An empty end date is still what reaches
  // the API; a blank field just is not an instruction anyone can see they gave.
  const [stillPlaying, setStillPlaying] = useState(false);
  // A pending edit like any other, not an immediate write.
  const [stopPending, setStopPending] = useState(startStopping && alreadyOpen);

  const sessionDirty = startDate !== "";
  const endWithoutStart = endDate !== "" && startDate === "";
  // With the checkbox, a blank end date no longer silently means "still
  // playing": say which you meant.
  const needsEnd = sessionDirty && !stillPlaying && endDate === "";
  const datesInvalid = sessionDirty && !stillPlaying && endDate !== "" && endDate < startDate;
  // One open session per game (create_my_session 409s otherwise). Staging the
  // stop first is legal because the actions layer closes before it inserts.
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
        // Stays on this view so the new row is visible; clear the drafts only.
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
        // No end date to give while the checkbox says there is none.
        disabled={isPending}
        endDisabled={stillPlaying}
        problem={problem}
      />

      {/* The label wraps the input, so the row is the tap target; py-1.5 makes
          it big enough on a phone.

          Fixed amber, not --link: this scrim is dark in BOTH schemes (see
          .game-card-surface), so light mode's amber-700 would be dark-on-dark. */}
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
