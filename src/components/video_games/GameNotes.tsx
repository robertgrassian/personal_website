"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { MAX_NOTE_LENGTH, NOTE_COUNTER_THRESHOLD } from "@/lib/notes";
import { continueList, toggleBullets, type Edit } from "@/lib/noteEditing";
import { Button } from "@/components/ui/Button";
import { ListBulletIcon } from "@/components/Icon";
import { fieldClass } from "./formStyles";
import type { NoteDraft } from "./useGameNote";

// "2026-08-24T18:03:11+00:00" → "Aug 24, 2026"
function formatEdited(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Through execCommand rather than setting `value`, so each toolbar edit is one
// step on the native undo stack (Cmd+Z, iOS shake or three-finger swipe).
// Deprecated on paper but implemented everywhere for textareas, and it fires a
// real input event, so React's onChange sees the change like typing. The
// fallback loses undo but not the edit.
function applyEdit(el: HTMLTextAreaElement, edit: Edit) {
  el.focus();
  el.setSelectionRange(edit.start, edit.end);
  if (edit.start !== edit.end || edit.text !== "") {
    const applied =
      edit.text === ""
        ? document.execCommand("delete")
        : document.execCommand("insertText", false, edit.text);
    if (!applied) {
      el.setRangeText(edit.text, edit.start, edit.end);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  el.setSelectionRange(edit.selStart, edit.selEnd);
}

// Keeps focus, and so the selection and the iOS keyboard, in the textarea when
// a toolbar button is pressed.
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

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
  const editable = !disabled && !loading;
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // What Clear removed, so it can be put back with one tap. Native undo also
  // works, but has no visible control on a phone.
  const [cleared, setCleared] = useState<string | null>(null);
  const canUndoClear = cleared !== null && note.value === "";

  const edit = (make: (el: HTMLTextAreaElement) => Edit | null) => {
    const el = fieldRef.current;
    if (!el) return;
    const next = make(el);
    if (next) applyEdit(el, next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing: Enter that confirms an IME candidate is not a newline.
    if (e.key !== "Enter" || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const next = continueList(el.value, el.selectionStart);
    if (!next) return;
    e.preventDefault();
    applyEdit(el, next);
  };

  const clearAll = () => {
    if (note.value === "") return;
    setCleared(note.value);
    edit((el) => ({ start: 0, end: el.value.length, text: "", selStart: 0, selEnd: 0 }));
  };

  const undoClear = () => {
    if (cleared === null) return;
    const text = cleared;
    setCleared(null);
    edit(() => ({ start: 0, end: 0, text, selStart: text.length, selEnd: text.length }));
  };

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
        <>
          <div className="mt-2 flex shrink-0 items-center justify-between gap-2">
            <Button
              onMouseDown={keepFocus}
              onClick={() =>
                edit((el) => toggleBullets(el.value, el.selectionStart, el.selectionEnd))
              }
              disabled={!editable}
              className="flex items-center gap-1.5"
            >
              <ListBulletIcon className="h-4 w-4" aria-hidden />
              List
            </Button>
            {canUndoClear ? (
              <Button variant="ghost" onMouseDown={keepFocus} onClick={undoClear}>
                Undo clear
              </Button>
            ) : (
              <Button
                variant="ghost"
                onMouseDown={keepFocus}
                onClick={clearAll}
                disabled={!editable || note.value === ""}
              >
                Clear
              </Button>
            )}
          </div>
          <label className="mt-2 flex min-h-0 flex-1 flex-col">
            <span className="sr-only">Notes for this game</span>
            {/* min-h-28 is the floor for a keyboard-shortened card, where the
                scroller takes over; above it the field grows to fill the case.
                resize-none because the card sets the height. */}
            <textarea
              ref={fieldRef}
              value={note.value}
              onChange={(e) => {
                note.setDraft(e.target.value);
                if (e.target.value !== "") setCleared(null);
              }}
              onKeyDown={onKeyDown}
              maxLength={MAX_NOTE_LENGTH}
              disabled={!editable}
              placeholder={
                loading ? "Loading your notes..." : "Left off at...\n\nNext session:\n- "
              }
              className={`${fieldClass} min-h-28 w-full flex-1 resize-none px-2.5 py-2 leading-relaxed disabled:opacity-60`}
            />
          </label>
        </>
      )}
    </div>
  );
}
