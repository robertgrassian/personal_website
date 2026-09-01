// The CRT slot on the library page, plus the owner's manage panel behind it.
//
// It exists because two decisions need the viewer's identity and LibraryPage is
// a Server Component: whether the label is a button, and whether the set shows
// at all when nothing is playing. It lives in video_games/ rather than crt/ so
// crt/ stays a presentational widget that /currently-playing can render without
// pulling in the library's actions and follow state.
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Game } from "@/lib/games";
import { CrtTv } from "@/components/crt/CrtTv";
import { useIsLikelyOwner } from "./FollowControls";

// Owner-only and opened on purpose, so nobody downloads it by visiting a
// library. Same treatment GameShelves gives StatsPanel.
const CurrentlyPlayingPanel = dynamic(
  () => import("./CurrentlyPlayingPanel").then((m) => m.CurrentlyPlayingPanel),
  { ssr: false }
);

type CurrentlyPlayingSectionProps = {
  /** The whole library, which the panel's picker searches. */
  games: Game[];
  currentlyPlayingGames: Game[];
};

export function CurrentlyPlayingSection({
  games,
  currentlyPlayingGames,
}: CurrentlyPlayingSectionProps) {
  // Likely, not confirmed. CLAUDE.md states the rule as "affordances that
  // CREATE a row use useIsConfirmedOwner", but the reason it gives is whether
  // the server can still refuse, and it can here: POST /me/games/{id}/sessions
  // hangs off an existing game row and 404s on someone else's. POST /me/games
  // is the exception because it has no row to aim at. The detail card already
  // opens sessions behind useIsLikelyOwner, so the confirmed hook would gate
  // one write two different ways.
  const canManage = useIsLikelyOwner();
  const [open, setOpen] = useState(false);

  // A visitor looking at a library with nothing in progress still gets no set,
  // exactly as before. The owner gets one so there is something to press.
  if (currentlyPlayingGames.length === 0 && !canManage) return null;

  return (
    <>
      {/* Accepted cost of showing the empty set: for an owner with nothing
          playing the CRT appears at hydration and pushes the shelves down. The
          ownedLibrary cache usually answers at hydration so it is not visible,
          but a cold first visit pays a round trip. There is no server-side fix
          while one HTML response serves every viewer. */}
      <CrtTv
        games={currentlyPlayingGames}
        compact
        onManage={canManage ? () => setOpen(true) : undefined}
      />
      {open && (
        <CurrentlyPlayingPanel
          games={games}
          currentlyPlayingGames={currentlyPlayingGames}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
