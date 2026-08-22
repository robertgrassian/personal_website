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
   *  holds its own copy and nothing tells it the server data moved. */
  refresh: () => void;
};

// Loads a library's play history once, the first time something asks to see it,
// and keeps it for the visit.
//
// `enabled` is an argument because hooks cannot be called conditionally: it is
// what keeps a page that never opens a history from fetching one, which is the
// reason this is a separate read at all.
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
    void load();
  }, [load]);

  return { sessions, isLoading, error, refresh };
}
