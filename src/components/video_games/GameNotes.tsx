"use client";

import { MAX_NOTE_LENGTH, NOTE_COUNTER_THRESHOLD } from "@/lib/notes";
import { Button } from "@/components/ui/Button";
import { fieldClass } from "./formStyles";
import type { NoteDraft } from "./useGameNote";

// "2026-08-24T18:03:11+00:00" → "Aug 24, 2026"
function formatEdited(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type GameNotesFaceProps = {
  note: NoteDraft;
  disabled: boolean;
};

/** The notes face of the detail card: a label row and one textarea that takes
 *  whatever height the card has left. The Save below it is the form's, shared
 *  with the other two faces.
 *
 *  A face rather than a preview on the details face, because that is what keeps
 *  the notes from costing the details face any height at all: the card there is
 *  already as tall as a phone allows. */
export function GameNotesFace({ note, disabled }: GameNotesFaceProps) {
  const loading = note.saved === null && note.loadError === null;
  const nearLimit = note.value.length >= NOTE_COUNTER_THRESHOLD;

  return (
    // flex-1 and min-h-0 down the chain from GameDetailCard, so the textarea is
    // sized by the card rather than the card by the textarea.
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mt-4 flex shrink-0 items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-shelf-label">Notes</p>
        {nearLimit ? (
          <p className="text-[11px] tabular-nums text-shelf-text-muted">
            {(MAX_NOTE_LENGTH - note.value.length).toLocaleString()} characters left
          </p>
        ) : (
          note.saved?.updatedAt && (
            <p className="text-[11px] text-shelf-text-muted">
              Edited {formatEdited(note.saved.updatedAt)}
            </p>
          )
        )}
      </div>

      {note.loadError !== null ? (
        // Editing stays shut until the read succeeds: saving over notes that
        // never loaded is the one unrecoverable mistake here.
        <div className="mt-3 flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-shelf-danger">
            {note.loadError}
          </p>
          <Button onClick={note.reload}>Try again</Button>
        </div>
      ) : (
        <label className="mt-2 flex min-h-0 flex-1 flex-col">
          <span className="sr-only">Notes for this game</span>
          {/* min-h-28 is the floor for a keyboard-shortened card, where the
              scroller takes over; above it the field grows to fill the case.
              resize-none because the card sets the height. */}
          <textarea
            value={note.value}
            onChange={(e) => note.setDraft(e.target.value)}
            maxLength={MAX_NOTE_LENGTH}
            disabled={disabled || loading}
            placeholder={loading ? "Loading your notes..." : "Left off at...\n\nNext session:\n- "}
            className={`${fieldClass} min-h-28 w-full flex-1 resize-none px-2.5 py-2 leading-relaxed disabled:opacity-60`}
          />
        </label>
      )}
    </div>
  );
}
