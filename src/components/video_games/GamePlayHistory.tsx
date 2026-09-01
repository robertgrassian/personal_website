"use client";

import { useState } from "react";
import { localToday, type Game } from "@/lib/games";
import { formatSessionRange, sessionLengthDays, type PlaySession } from "@/lib/sessions";
import { saveGameEdits } from "@/app/video-games/actions";
import { useServerAction } from "./useServerAction";
import { PlayedFields } from "./PlayedFields";
import { usePlayDraft } from "./usePlayDraft";
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

  // A pending edit like any other, not an immediate write.
  const [stopPending, setStopPending] = useState(startStopping && alreadyOpen);

  // Staging the stop first is what makes a second open session legal: the
  // actions layer closes before it inserts, so the 409 rule only bites while
  // the open one is staying open.
  //
  // No "Not yet" choice: this form is already inside the game's play history,
  // where the way to log nothing is to leave the dates alone.
  const play = usePlayDraft({
    startToday: startToday && !alreadyOpen,
    blockedByOpenSession: alreadyOpen && !stopPending,
  });
  const sessionDraft = play.session;

  const hasChanges = sessionDraft.dirty || stopPending;
  const canSave = hasChanges && sessionDraft.problem === null && !isPending;

  const save = () => {
    run(
      () =>
        saveGameEdits(game.id, {
          ...(sessionDraft.value ? { session: sessionDraft.value } : {}),
          ...(stopPending && openSessionId !== null
            ? { stopSessionId: openSessionId, stopDate: localToday() }
            : {}),
        }),
      {
        // Stays on this view so the new row is visible; clear the drafts only.
        onSuccess: () => {
          play.reset();
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

      {/* Not "Add a Session": session is the database's word, and no
          user-facing copy in the library uses it. */}
      <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-shelf-label">
        Add a Playthrough
      </p>
      <div className="mt-2">
        <PlayedFields
          play={play}
          label="Was this a past playthrough?"
          labelHidden
          disabled={isPending}
        />
      </div>

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
