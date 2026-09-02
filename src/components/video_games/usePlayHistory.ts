"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPlayHistory } from "@/app/video-games/actions";
import type { PlaySession } from "@/lib/sessions";
import { useLibraryOwnerUsername } from "./FollowControls";

export type PlayHistoryState = {
  sessions: PlaySession[];
  isLoading: boolean;
  error: string | null;
  /** Re-read after a write. The action purges the cache tag, but this hook
   *  holds its own copy and nothing tells it the server data moved. Every write
   *  that can log a playthrough has to call this, including the two that create
   *  the game as well: an add and a promote leave the list on screen stale for
   *  the rest of the visit otherwise. No-op until something has been read. */
  refresh: () => void;
};

// Loads a library's play history once, the first time something asks to see it,
// and keeps it for the visit.
//
// `enabled` is an argument because hooks cannot be called conditionally: it is
// what keeps a page that never opens a history from fetching one, which is the
// reason this is a separate read at all.
//
// KNOWN GAP: GameLibrary owns the only instance, so CurrentlyPlayingSection,
// which is its sibling under LibraryPage, cannot call refresh(). Someone who
// opened Stats -> Play History earlier in the visit and then starts or stops a
// game from the currently-playing panel keeps the stale session list until a
// reload. revalidateTag does not reach this copy. The fix, if it ever matters,
// is to hoist this into a provider mounted by LibraryPage and consumed by both;
// that was not worth refactoring an unrelated component for a one-visit window.
export function usePlayHistory(enabled: boolean): PlayHistoryState {
  const username = useLibraryOwnerUsername();
  const [sessions, setSessions] = useState<PlaySession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not state: it must update synchronously so the effect cannot fire
  // twice before a re-render, which is what React's double-invoke does.
  const loadedFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (username === "") return;
    loadedFor.current = username;
    setIsLoading(true);
    setError(null);
    const result = await getPlayHistory(username);
    setIsLoading(false);
    if (result.ok) setSessions(result.sessions);
    // Keep the rows on screen: a stale list with an error line beats emptying
    // the panel the viewer is reading.
    else setError(result.message);
  }, [username]);

  useEffect(() => {
    if (!enabled || loadedFor.current === username) return;
    void load();
  }, [enabled, username, load]);

  const refresh = useCallback(() => {
    // Nothing read yet means nothing to re-read: the first open fetches current
    // data anyway, and loading here would pay for a panel nobody has opened.
    if (loadedFor.current === null) return;
    void load();
  }, [load]);

  return { sessions, isLoading, error, refresh };
}
