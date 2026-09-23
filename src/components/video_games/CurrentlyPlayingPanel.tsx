// The owner's one place to see everything in progress, close any of it, and
// start something new. Before this, closing a game you could see on the CRT
// meant finding it in the shelves, opening its detail card, "View or add play
// history", "Stop Playing", Save.
//
// It reads no sessions. "Currently playing" is derived server-side onto the
// game row (currentlyPlaying, playingSince, openSessionId), so the whole panel
// runs off the same array the shelves already have.
"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { localToday, systemLabel, type Game } from "@/lib/games";
import { formatDayShort } from "@/lib/sessions";
import { saveGameEdits } from "@/app/video-games/actions";
import { useServerAction } from "./useServerAction";
import { ConfirmStep } from "./ConfirmStep";
import { startableGames } from "./playingPicker";
import { ModalShell } from "./ModalShell";
import { Button } from "@/components/ui/Button";
import { inputClass } from "./formStyles";

const headingClass = "text-xs font-semibold uppercase tracking-widest text-shelf-label";
const coverClass = "h-[54px] w-10 shrink-0 rounded object-cover";

// Rows are top-aligned, not centre-aligned, and every cell is pinned to the
// cover's own height. A row grows downward when its confirm opens, and under
// `items-center` that re-centred the whole row: the cover visibly dropped by
// half the new height. Anchoring the top means only the confirm itself moves.
//
// pr-3 keeps the trailing button clear of the scrollbar, which on macOS is an
// overlay that appears over the content on hover rather than taking width of
// its own.
const rowClass = "flex flex-wrap items-start gap-3 rounded-md p-2";
const rowCellClass = "flex min-h-[54px] shrink-0 items-center";
const listClass = "mt-2 flex flex-col gap-1 pr-3";

// Which row the in-flight write belongs to, and which half of the panel it
// came from. The kind is what routes the error message: a failed stop belongs
// beside its own confirm, a failed start under the picker.
type Acting = { id: number; kind: "stop" | "start" };

type CurrentlyPlayingPanelProps = {
  /** The whole library, for the picker. */
  games: Game[];
  currentlyPlayingGames: Game[];
  onClose: () => void;
};

/** Cover art at the row size, or a placeholder box for a game with no art so
 *  every row stays the same height. */
function RowCover({ game }: { game: Game }) {
  if (game.imageUrl === "") {
    return <div aria-hidden="true" className={`${coverClass} bg-shelf-input`} />;
  }
  return <Image src={game.imageUrl} alt="" width={40} height={54} className={coverClass} />;
}

export function CurrentlyPlayingPanel({
  games,
  currentlyPlayingGames,
  onClose,
}: CurrentlyPlayingPanelProps) {
  const [query, setQuery] = useState("");
  // Deliberately NOT cleared when a write fails: the message has to stay
  // attached to the game it failed for.
  const [acting, setActing] = useState<Acting | null>(null);
  // Which row has its confirm open, so that row can give the confirm a full
  // line instead of the sliver left beside the title.
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const { isPending, error, run } = useServerAction();
  const searchRef = useRef<HTMLInputElement>(null);

  const candidates = startableGames(games, query);
  const nothingPlaying = currentlyPlayingGames.length === 0;
  // Everything is already in progress, which is a different answer from a
  // search that found nothing.
  const allPlaying = query.trim() === "" && candidates.length === 0;

  /** True while THIS row is the one waiting, so a second row is disabled but
   *  not also labelled busy. */
  const busy = (id: number, kind: Acting["kind"]) =>
    isPending && acting?.id === id && acting.kind === kind;

  const errorFor = (id: number, kind: Acting["kind"]) =>
    acting?.id === id && acting.kind === kind ? error : null;

  const stop = (game: Game) => {
    const sessionId = game.openSessionId;
    // Both fields or the edit is rejected wholesale, so a row that reads as
    // playing without a session id must not send half of one.
    if (sessionId === null) return;
    setActing({ id: game.id, kind: "stop" });
    run(() => saveGameEdits(game.id, { stopSessionId: sessionId, stopDate: localToday() }));
  };

  const start = (game: Game) => {
    setActing({ id: game.id, kind: "start" });
    run(() => saveGameEdits(game.id, { session: { startDate: localToday(), endDate: null } }), {
      onSuccess: () => {
        setActing(null);
        // The started game leaves the picker (it is playing now) and appears in
        // the list above. Leaving the query behind would show a result set that
        // just lost a row, which reads as the start having failed.
        setQuery("");
      },
    });
  };

  return (
    <ModalShell
      label="Manage currently playing games"
      title="Currently playing"
      subtitle={
        nothingPlaying ? "Nothing in progress" : `${currentlyPlayingGames.length} in progress`
      }
      onClose={onClose}
      // Errors ride the control that was pressed, so the shell's own line stays
      // empty: it sits at the panel's bottom edge, too far from either half.
      error={null}
      panelClassName="flex max-h-full sm:max-h-[80%] w-full max-w-md flex-col"
      // This panel owns its scroll container so the gap under the header can
      // sit OUTSIDE it. A margin on the first heading instead scrolls away with
      // the content, leaving the list touching "N in progress" the moment you
      // scroll, since the header does not move.
      scrollBody={false}
      // Focus the search box only when there is nothing to read. Otherwise
      // opening the panel raises the keyboard over the very list it was opened
      // for, and useModalChrome's stage-two scroll lock costs Safari its
      // collapsed URL bar (docs/mobile-viewport.md).
      initialFocusRef={nothingPlaying ? searchRef : undefined}
    >
      {/* Classes copied from ModalShell's own body, which this replaces: the
          -mx-1/px-1 pair gives focus rings a pixel to sit in, and setting one
          overflow axis computes the other to `auto`, so both are named. */}
      <div className="-mx-1 mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-1">
        <p className={headingClass}>Playing now</p>
        {nothingPlaying ? (
          <p className="mt-2 text-sm italic text-shelf-text-muted">Nothing is playing right now.</p>
        ) : (
          <ul className={listClass}>
            {currentlyPlayingGames.map((game) => (
              <li key={game.id} className={rowClass}>
                <RowCover game={game} />
                <span className="flex h-[54px] min-w-0 flex-1 flex-col justify-center">
                  <span className="block truncate text-sm text-shelf-text">{game.name}</span>
                  <span className="block truncate text-xs text-shelf-text-muted">
                    {systemLabel(game.system)}
                    {game.playingSince && ` · since ${formatDayShort(game.playingSince)}`}
                  </span>
                </span>
                {/* Neutral rather than red: this ends a session, it deletes
                  nothing, and a new one can be opened any time. */}
                {/* The confirm takes a line of its own rather than the space
                  beside the title, which it squeezed down to an ellipsis. The
                  row wraps, so the cover and title above it do not move. */}
                <div className={confirmingId === game.id ? "w-full" : rowCellClass}>
                  <ConfirmStep
                    onConfirmingChange={(on) => setConfirmingId(on ? game.id : null)}
                    triggerLabel={busy(game.id, "stop") ? "Stopping…" : "Stop"}
                    tone="neutral"
                    prompt={
                      <>
                        Stop playing <strong>{game.name}</strong>?
                      </>
                    }
                    confirmLabel="Stop playing"
                    onConfirm={() => stop(game)}
                    disabled={isPending}
                    error={errorFor(game.id, "stop")}
                    triggerClassName="shrink-0"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className={`${headingClass} mt-5`}>Start playing</p>
        {allPlaying ? (
          <p className="mt-2 text-sm italic text-shelf-text-muted">
            Every game in your library is already in progress.
          </p>
        ) : (
          <>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
              placeholder="Search your library"
              aria-label="Search your library for a game to start"
              className={`${inputClass} mt-2`}
            />
            <ul className={listClass}>
              {candidates.length === 0 && (
                <li className="text-xs italic text-shelf-text-muted">No matches.</li>
              )}
              {candidates.map((game) => (
                <li key={game.id} className={rowClass}>
                  <RowCover game={game} />
                  <span className="flex h-[54px] min-w-0 flex-1 flex-col justify-center">
                    <span className="block truncate text-sm text-shelf-text">{game.name}</span>
                    <span className="block truncate text-xs text-shelf-text-muted">
                      {systemLabel(game.system)}
                      {game.lastPlayed && ` · last played ${formatDayShort(game.lastPlayed)}`}
                    </span>
                  </span>
                  {/* A trailing button rather than GameSearchStep's whole-row
                    one: there a press opens a form, here it writes, and a stray
                    tap while scrolling a long list would open a session that
                    can only be closed, never removed. */}
                  <span className={rowCellClass}>
                    <Button onClick={() => start(game)} disabled={isPending}>
                      {busy(game.id, "start") ? "Starting…" : "Start"}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
            {acting?.kind === "start" && error !== null && (
              <p role="alert" className="mt-2 text-xs text-shelf-danger">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}
