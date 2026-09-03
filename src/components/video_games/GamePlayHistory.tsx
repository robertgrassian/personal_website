"use client";

import { formatSessionRange, sessionLengthDays, type PlaySession } from "@/lib/sessions";
import { PlayedFields } from "./PlayedFields";
import type { PlayDraft } from "./usePlayDraft";
import { StopPlayingControl } from "./StopPlayingControl";

type GamePlayHistoryProps = {
  // Newest first, narrowed by the caller out of the one whole-library fetch,
  // so opening this view costs no extra request.
  sessions: PlaySession[];
  isLoading: boolean;
  error: string | null;
  play: PlayDraft;
  // Whether there is an open session for "Stop Playing" to close.
  hasOpenSession: boolean;
  stopPending: boolean;
  onStopPendingChange: (pending: boolean) => void;
  disabled: boolean;
};

// One logged session, on the card's scrim. Not PlayHistoryList: that one uses
// site tokens and names the game on every row.
function SessionRow({ session }: { session: PlaySession }) {
  const days = sessionLengthDays(session);
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-shelf-border py-2 last:border-b-0">
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
// Holds no draft and owns no Save: GameEditFields owns both and renders this as
// one of its two faces. This used to have a Save of its own covering only what
// was on this screen, which meant the same-looking button committed different
// things depending on the face you were on and on whether the subject was a
// promote.
export function GamePlayHistory({
  sessions,
  isLoading,
  error,
  play,
  hasOpenSession,
  stopPending,
  onStopPendingChange,
  disabled,
}: GamePlayHistoryProps) {
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

      {hasOpenSession && (
        <div className="mt-4">
          <StopPlayingControl
            stopPending={stopPending}
            onChange={onStopPendingChange}
            disabled={disabled}
          />
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
          label="Add a playthrough"
          labelHidden
          // "Not yet" would be wrong here: the list above may already show
          // several. This choice means "not adding one".
          neutralLabel="None"
          disabled={disabled}
        />
      </div>
    </>
  );
}
