"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPlayHistory } from "@/app/video-games/actions";
import type { PlaySession } from "@/lib/sessions";
import { useLibraryOwnerUsername } from "./FollowControls";

export type PlayHistoryState = {
  sessions: PlaySession[];
  isLoading: boolean;
  error: string | null;
  /** Re-read the history. Call after a write that logs or closes a session:
   *  the Server Action purges the cache tag, but this hook holds its own copy
   *  in component state and nothing tells it the server data moved. */
  refresh: () => void;
};

// Loads a library's play history, once, the first time something asks to see
// it — and keeps it for the rest of the visit.
//
// `enabled` rather than a call site that mounts the hook conditionally: hooks
// cannot be called conditionally, so "don't fetch yet" has to be an argument.
// Passing the panel's own open state means the request goes out when the panel
// is first opened and never on a page load that never opens it, which is the
// whole reason this is a separate read from the library payload.
//
// State lives at the call site's level (GameLibrary), not in a context, because
// only two surfaces read it and both are its descendants.
export function usePlayHistory(enabled: boolean): PlayHistoryState {
  const username = useLibraryOwnerUsername();
  const [sessions, setSessions] = useState<PlaySession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether a fetch has already been made for this username. A ref, not state:
  // it must update synchronously so the effect below cannot fire twice before a
  // re-render, which is exactly what React 18's development double-invoke does.
  const loadedFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (username === "") return;
    loadedFor.current = username;
    setIsLoading(true);
    setError(null);
    const result = await getPlayHistory(username);
    setIsLoading(false);
    if (result.ok) setSessions(result.sessions);
    // The rows already on screen are kept on a failed refresh: a stale list
    // with an error line beats emptying the panel the viewer is reading.
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
