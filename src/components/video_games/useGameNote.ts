"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getGameNote } from "@/app/video-games/actions";
import type { GameNote } from "@/lib/notes";

export type NoteDraft = {
  /** What the textarea shows: the draft if one has been typed, the saved body
   *  otherwise. */
  value: string;
  /** The saved note, or null until it has loaded. Distinct from an empty note,
   *  and only an empty one is safe to let a Save overwrite. */
  saved: GameNote | null;
  loadError: string | null;
  dirty: boolean;
  setDraft: (body: string) => void;
  /** After a Save that carried the note: it becomes the saved one. */
  markSaved: () => void;
  reload: () => void;
};

// One game's notes: the read, and the draft that the form's one Save commits.
//
// Held by the card rather than the form, because the card needs `dirty` to
// refuse a close that would throw a page of typing away. The form still owns
// the Save, the same as every other draft on the card.
//
// Per game rather than with the library read: notes are owner-only, so they
// cannot ride the shared cached payload, and at 20,000 characters each a
// whole-library fetch would be megabytes on a large shelf.
export function useGameNote(gameId: number, enabled: boolean): NoteDraft {
  const [saved, setSaved] = useState<GameNote | null>(null);
  // null = untouched, so the field follows `saved`: a note still in flight
  // when the face opens fills in on arrival, while text already typed wins.
  const [draft, setDraftState] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Bumped by every load, so a late answer for an earlier game is dropped
  // rather than shown, and then saved, under the current one's id.
  const runId = useRef(0);

  const load = useCallback(() => {
    const run = ++runId.current;
    setLoadError(null);
    void getGameNote(gameId).then((result) => {
      if (run !== runId.current) return;
      if (result.ok) setSaved(result.note);
      else setLoadError(result.message);
    });
  }, [gameId]);

  useEffect(() => {
    if (!enabled) return;
    // Reset first: answering "Played?" on a game already owned swaps the id
    // under a mounted card, and the previous game's note must not linger.
    setSaved(null);
    setDraftState(null);
    load();
  }, [enabled, load]);

  const value = draft ?? saved?.body ?? "";
  // Trimmed on both sides, as the API stores it, so trailing whitespace alone
  // does not arm Save. Never dirty before the read lands.
  const dirty = saved !== null && draft !== null && draft.trim() !== saved.body.trim();

  const markSaved = useCallback(() => {
    setSaved((prev) =>
      prev === null
        ? prev
        : {
            body: value.trim(),
            // The server stamps its own time; this is the same moment to within
            // a round trip, and saves re-reading what was just written.
            updatedAt: value.trim() === "" ? null : new Date().toISOString(),
          }
    );
    setDraftState(null);
  }, [value]);

  return {
    value,
    saved,
    loadError,
    dirty,
    setDraft: setDraftState,
    markSaved,
    reload: load,
  };
}
