"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { API_PREFIX } from "@/lib/apiPrefix";
import { saveGameNote } from "@/app/video-games/actions";
import type { GameNote } from "@/lib/notes";
import { useServerAction } from "./useServerAction";

export type GameNoteState = {
  /** What the textarea shows: the draft if one has been typed, the saved body
   *  otherwise. */
  body: string;
  /** The saved note, or null while it has not loaded. Distinct from an empty
   *  note: the preview renders "loading", not "you have not written any". */
  saved: GameNote | null;
  isDirty: boolean;
  isLoading: boolean;
  /** The read failed. Editing is blocked while this is set, because a save
   *  would write over notes we never managed to show. */
  loadError: string | null;
  saveError: string | null;
  isSaving: boolean;
  setDraft: (body: string) => void;
  discard: () => void;
  save: () => void;
  reload: () => void;
};

// Everything one game's notes need: the read, the draft, and the save.
//
// The READ is a direct browser → FastAPI call with the session token, which is
// the pattern meApi.ts documents for authenticated PER-VIEWER reads
// (useViewerRelationship is the other one). Notes qualify twice over: they are
// owner-only, and they are the one library resource with no public endpoint at
// all, so there is no server-only module to reach through a Server Action the
// way getPlayHistory does.
//
// The WRITE still goes through a Server Action, because writes always do.
//
// Per game, which is the opposite of usePlayHistory: sessions are small enough
// that one whole-library fetch beats one per card, while notes are capped at
// 20,000 characters EACH, so the same trick would be tens of megabytes on a
// large shelf. The cost is one small request per card the owner opens.
//
// The draft lives here rather than in the editor so it survives the editor
// unmounting — the notes view and the detail view are two faces of one card,
// and going back to check a rating must not discard a page of typing.
export function useGameNote(gameId: number, enabled: boolean): GameNoteState {
  const [saved, setSaved] = useState<GameNote | null>(null);
  // null = untouched, so the textarea follows `saved`. That is what lets a note
  // still in flight when the editor opens fill the field on arrival, while text
  // already typed wins over it.
  const [draft, setDraftState] = useState<string | null>(null);
  // Starts true when a load is coming, not false. load() runs from an effect,
  // so a false start paints one frame of saved === null AND isLoading === false,
  // which the preview renders as "Nothing yet" -- the lie GameNotes explicitly
  // must not tell about a note still arriving.
  const [isLoading, setIsLoading] = useState(enabled);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { isPending: isSaving, error: saveError, setError: setSaveError, run } = useServerAction();

  // A ref, not state: it must update synchronously so the effect cannot fire
  // twice before a re-render, which is what React's double-invoke does. Same
  // reasoning as usePlayHistory's loadedFor.
  const loadedFor = useRef<number | null>(null);

  // Bumped by every load, so an earlier one that comes back late can tell it is
  // no longer the current request and drop its answer. Today no two loads
  // overlap -- the mount effect and "Try again" cannot run concurrently -- but
  // that is incidental, not designed, and the failure it would allow is the one
  // the reset below exists to prevent: one game's note shown under another's
  // id, then saved onto it.
  const runId = useRef(0);

  const load = useCallback(async () => {
    loadedFor.current = gameId;
    const run = ++runId.current;
    const current = () => run === runId.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      // Only the owner reaches this, but a session can expire between opening
      // the library and opening a card.
      if (!session) throw new Error("no session");

      // Relative URL: the API_PREFIX rewrite makes this same-origin in dev and
      // prod alike, so no CORS is involved.
      const res = await fetch(`${API_PREFIX}/me/games/${gameId}/note`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store", // per-viewer, never cached
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const note = (await res.json()) as GameNote;
      if (current()) setSaved(note);
    } catch (err) {
      // Logged where the cause is readable; the viewer gets the instruction.
      console.error("Loading notes failed:", err);
      // `saved` is left null rather than defaulted to an empty note: "we could
      // not read your notes" and "you have not written any" must never look the
      // same, or a save would overwrite text that was there all along.
      if (current()) setLoadError("Could not load your notes. Try again.");
    } finally {
      if (current()) setIsLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    if (!enabled || loadedFor.current === gameId) return;
    // Reset before loading, not after. Load-bearing on the one path where the
    // id changes under a mounted card: answering "Played?" on a game already
    // owned swaps the subject in place rather than remounting. Without this the
    // previous game's note stays on screen until the new one lands, and a save
    // in that window writes it onto the wrong game.
    setSaved(null);
    setDraftState(null);
    void load();
  }, [enabled, gameId, load]);

  const setDraft = useCallback(
    (body: string) => {
      setDraftState(body);
      // Clear a stale failure the moment the text changes, so the message
      // belongs to the attempt in front of you.
      setSaveError(null);
    },
    [setSaveError]
  );

  const discard = useCallback(() => {
    setDraftState(null);
    setSaveError(null);
  }, [setSaveError]);

  const body = draft ?? saved?.body ?? "";
  // Trimmed on both sides, matching the API: it strips before storing, so
  // trailing whitespace alone is not a change and must not arm Save.
  const isDirty = draft !== null && draft.trim() !== (saved?.body ?? "").trim();

  const save = useCallback(() => {
    run(async () => {
      const result = await saveGameNote(gameId, body);
      // Set here rather than in onSuccess, which is not handed the result.
      // Dropping the draft is what makes the field follow the saved value
      // again, so the "Edited" line and the text can never disagree.
      if (result.ok) {
        setSaved(result.note);
        setDraftState(null);
      }
      return result;
    });
  }, [gameId, body, run]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return {
    body,
    saved,
    isDirty,
    isLoading,
    loadError,
    saveError,
    isSaving,
    setDraft,
    discard,
    save,
    reload,
  };
}
