"use client";

import { MAX_NOTE_LENGTH, NOTE_COUNTER_THRESHOLD } from "@/lib/notes";
import { buttonClass, ghostButtonClass, saveButtonClass } from "./formStyles";
import type { GameNoteState } from "./useGameNote";

// "2026-08-24T18:03:11+00:00" → "Aug 24, 2026"
function formatEdited(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Blank lines are the paragraph breaks of a notes file, so the preview drops
// them rather than spending one of its three visible lines on nothing. The
// remaining newlines are kept: a "next session" list wants to look like a list,
// which is what the whitespace-pre-line below renders.
function previewText(body: string): string {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n");
}

type PreviewProps = {
  note: GameNoteState;
  onOpen: () => void;
};

/** The small view on the back of the case: three lines of the note, or an
 *  invitation to write one. The whole block is the button that opens the
 *  editor, so the target is the text you are trying to read rather than a
 *  pencil beside it.
 *
 *  Owner-only, by virtue of where the card renders it. Notes have no public
 *  endpoint, so there is nothing to show a viewer even if this leaked. */
export function GameNotesPreview({ note, onOpen }: PreviewProps) {
  const preview = previewText(note.body);
  const empty = preview === "";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-1 block w-full rounded-md border border-shelf-plank px-3 py-2.5 text-left transition-colors hover:bg-shelf-input cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-shelf-label">
          Notes
        </span>
        {note.saved?.updatedAt && !note.isDirty && (
          <span className="shrink-0 text-[11px] text-shelf-text-muted">
            Edited {formatEdited(note.saved.updatedAt)}
          </span>
        )}
        {note.isDirty && (
          <span className="shrink-0 text-[11px] text-shelf-text-muted">Unsaved changes</span>
        )}
      </span>

      {/* Three states, and the loading one is not folded into the empty one:
          "no notes yet" would be a lie about a note still arriving, and it is
          the lie that invites typing over it. */}
      {note.loadError !== null ? (
        <span className="mt-1 block text-sm text-shelf-danger">{note.loadError}</span>
      ) : note.isLoading && empty ? (
        <span className="mt-1 block text-sm text-shelf-text-muted italic">Loading notes...</span>
      ) : empty ? (
        <span className="mt-1 block text-sm text-shelf-text-muted italic">
          Nothing yet. Track where you left off, or what to do next.
        </span>
      ) : (
        // No `block` alongside line-clamp-3: the clamp works by setting
        // display:-webkit-box, and a display utility next to it wins and
        // silently turns the clamp off.
        <span className="mt-1 line-clamp-3 whitespace-pre-line text-sm leading-snug text-shelf-text">
          {preview}
        </span>
      )}
    </button>
  );
}

type EditorProps = {
  note: GameNoteState;
  /** Set while a close was intercepted because the draft is unsaved. The card
   *  owns this: it is the thing being closed. */
  closeBlocked: boolean;
  onKeepEditing: () => void;
  onDiscardAndClose: () => void;
};

/** The full-card notes view: the second face of the detail card, in the same
 *  slot the play history uses. Not a second dialog, for the reason
 *  GameDetailCard gives: that would mean two focus traps and two Escape
 *  handlers.
 *
 *  Explicit Save, no autosave, matching every other persisted edit in this
 *  directory. The data-loss risk that normally argues for autosave is covered
 *  instead by the draft outliving this component (useGameNote) and by the
 *  unsaved-changes guard on close. */
export function GameNotesEditor({
  note,
  closeBlocked,
  onKeepEditing,
  onDiscardAndClose,
}: EditorProps) {
  const remaining = MAX_NOTE_LENGTH - note.body.length;
  const blocked = note.loadError !== null;

  return (
    // h-full rather than letting content set the height: the textarea below is
    // the thing that should scroll, so this face fills the card and the parent's
    // scrolling is turned off for it (see GameDetailCard).
    <div className="flex h-full flex-col px-5 pb-4 pt-1">
      <div className="flex shrink-0 items-baseline justify-between gap-3 pb-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-shelf-label">Notes</p>
        {note.saved?.updatedAt && (
          <p className="shrink-0 text-[11px] text-shelf-text-muted">
            Edited {formatEdited(note.saved.updatedAt)}
          </p>
        )}
      </div>

      {blocked ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-3">
          <p role="alert" className="text-sm text-shelf-danger">
            {note.loadError}
          </p>
          {/* Editing stays shut until the read succeeds: saving over notes we
              never showed is the one unrecoverable mistake here. */}
          <button type="button" onClick={note.reload} className={buttonClass}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <label className="flex min-h-0 flex-1 flex-col">
            <span className="sr-only">Notes for this game</span>
            {/* min-h-0 so the flex item may shrink below its content and scroll
                internally; resize-none because the card sets the height and a
                drag handle would fight it. */}
            <textarea
              value={note.body}
              onChange={(e) => note.setDraft(e.target.value)}
              maxLength={MAX_NOTE_LENGTH}
              disabled={note.isLoading || note.isSaving}
              placeholder={"Left off at...\n\nNext session:\n- "}
              className="min-h-0 w-full flex-1 resize-none rounded border border-shelf-input-border bg-shelf-input px-2.5 py-2 text-base pointer-fine:text-sm leading-relaxed text-shelf-input-text focus:outline-none focus:ring-1 focus:ring-shelf-input-ring disabled:opacity-60"
            />
          </label>

          <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={note.save}
              disabled={!note.isDirty || note.isSaving}
              className={saveButtonClass}
            >
              {note.isSaving ? "Saving..." : "Save"}
            </button>
            {note.isDirty && (
              <button type="button" onClick={note.discard} className={ghostButtonClass}>
                Discard changes
              </button>
            )}
            {/* Only near the limit. A counter on an empty note is noise about a
                ceiling nobody is approaching. */}
            {note.body.length >= NOTE_COUNTER_THRESHOLD && (
              <span className="ml-auto text-[11px] tabular-nums text-shelf-text-muted">
                {remaining.toLocaleString()} characters left
              </span>
            )}
          </div>

          {note.saveError && (
            <p role="alert" className="mt-2 shrink-0 text-xs text-shelf-danger">
              {note.saveError}
            </p>
          )}

          {closeBlocked && (
            <div className="mt-3 shrink-0 rounded-md border border-shelf-plank bg-shelf-input px-3 py-2.5">
              <p className="text-sm text-shelf-text">
                These notes have not been saved. Close anyway?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={onKeepEditing} className={buttonClass}>
                  Keep editing
                </button>
                <button type="button" onClick={onDiscardAndClose} className={ghostButtonClass}>
                  Discard and close
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
