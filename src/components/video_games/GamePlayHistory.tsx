"use client";

import { useRef, useState } from "react";

import { formatSessionRange, sessionLengthDays, type PlaySession } from "@/lib/sessions";
import { PlayedFields } from "./PlayedFields";
import type { PlayDraft } from "./usePlayDraft";
import { localToday } from "@/lib/games";
import { Button } from "@/components/ui/Button";
import { FinishingPlaythrough } from "./FinishingPlaythrough";

type GamePlayHistoryProps = {
  // Newest first, narrowed by the caller out of the library's sessions, which
  // arrive with the page.
  sessions: PlaySession[];
  play: PlayDraft;
  // The session "Stop Playing" would close, or null when not playing. Taken
  // from the game rather than found in `sessions`: the two are cached
  // separately, so the list can briefly lack it.
  openSession: { id: number; startDate: string } | null;
  // The end date a staged stop will save, or null when none is staged.
  stopDate: string | null;
  onStopDateChange: (stopDate: string | null) => void;
  disabled: boolean;
};

const rowClass = "border-b border-shelf-border py-2 last:border-b-0";

// One logged session, on the card's scrim. Not PlayHistoryList: that one uses
// site tokens and names the game on every row.
function SessionRow({ session }: { session: PlaySession }) {
  const days = sessionLengthDays(session);
  return (
    <li className={`flex items-baseline justify-between gap-3 ${rowClass}`}>
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
  play,
  openSession,
  stopDate,
  onStopDateChange,
  disabled,
}: GamePlayHistoryProps) {
  // "Add another playthrough" pressed while a stop is staged. Cleared by Keep
  // Playing, so staging again starts from the short form.
  const [addWhileFinishing, setAddWhileFinishing] = useState(false);
  // Which control should take focus once it mounts, because the one that was
  // pressed has just unmounted. Read in ref callbacks, which run on mount.
  const focusNext = useRef<"stop" | "add" | null>(null);
  const focusIf = (which: "stop" | "add") => (el: HTMLElement | null) => {
    if (el && focusNext.current === which) {
      focusNext.current = null;
      el.focus();
    }
  };

  const rows: PlaySession[] =
    openSession === null || sessions.some((s) => s.id === openSession.id)
      ? sessions
      : [
          { id: openSession.id, gameId: -1, startDate: openSession.startDate, endDate: null },
          ...sessions,
        ];

  // The open playthrough, in its place in the list. Stop Playing sits on the
  // row it closes, and pressing it opens that same row into its dates, so what
  // the press did is drawn where you pressed.
  const renderOpenRow = (session: PlaySession) =>
    stopDate === null ? (
      <li key={session.id} className={`flex items-center justify-between gap-3 ${rowClass}`}>
        <span className="min-w-0 text-sm text-shelf-text">{formatSessionRange(session)}</span>
        <Button
          ref={focusIf("stop")}
          onClick={() => onStopDateChange(localToday())}
          disabled={disabled}
        >
          Stop Playing
        </Button>
      </li>
    ) : (
      <li key={session.id} className={rowClass}>
        <FinishingPlaythrough
          startDate={session.startDate}
          stopDate={stopDate}
          onStopDateChange={onStopDateChange}
          onUndo={() => {
            focusNext.current = "stop";
            setAddWhileFinishing(false);
            onStopDateChange(null);
          }}
          disabled={disabled}
        />
      </li>
    );

  // While finishing, an untouched "None" chooser reads as a second question
  // the stop still needs answered, so it collapses to a link. Never once a
  // choice is made: hiding a pending playthrough would hide part of what Save
  // commits.
  const showAdd = stopDate === null || play.choice !== "no" || addWhileFinishing;

  return (
    <>
      <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-shelf-label">
        Play History
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-shelf-text-muted italic">
          Nothing logged yet. Add the first one below.
        </p>
      ) : (
        <ol className="mt-2">
          {rows.map((session) =>
            session.id === openSession?.id ? (
              renderOpenRow(session)
            ) : (
              <SessionRow key={session.id} session={session} />
            )
          )}
        </ol>
      )}

      {showAdd ? (
        <div ref={focusIf("add")} tabIndex={-1} className="focus:outline-none">
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
        </div>
      ) : (
        <Button
          variant="ghost"
          onClick={() => {
            focusNext.current = "add";
            setAddWhileFinishing(true);
          }}
          disabled={disabled}
          className="mt-4"
        >
          Add another playthrough
        </Button>
      )}
    </>
  );
}
