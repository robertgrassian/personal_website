"use client";

import { useEffect, useId, useRef } from "react";
import { localToday } from "@/lib/games";
import { fieldClass, ghostButtonClass } from "./formStyles";

// Date inputs size to their content rather than filling the row, so they take
// the shared tokens plus their own padding instead of `inputClass`.
//
// The disabled styling is load-bearing, not decoration. A disabled date input
// drops its calendar glyph and changes nothing else, so "you cannot answer this
// right now" was being signalled by a small icon going missing — which reads as
// a rendering glitch rather than as a state.
const dateInputClass = `${fieldClass} px-2 py-1 disabled:opacity-50 disabled:cursor-default`;

// The shared labelClass unpacked into its two jobs, because the caption line
// now holds a Clear button beside the text. It cannot stay one <label>: button
// is a labelable element, so a button inside the label would become the label's
// control and quietly break the caption's link to the date input.
const fieldColumnClass = "flex min-w-0 flex-col gap-1";
const captionRowClass =
  "flex items-center gap-2 text-[10px] uppercase tracking-wide text-shelf-label";
// Negative margin cancels the padding, so the touch area is bigger than the
// 10px caption line without the line growing to fit it.
const clearButtonClass = `-my-1.5 py-1.5 text-[10px] normal-case ${ghostButtonClass}`;

// Deliberately NO showPicker() call on click. Calling it from an onClick
// fights the browser: clicking the calendar glyph already opens the picker
// natively, so the handler fired a second time and the picker flickered shut.
// Native behaviour is worse in one way (the calendar opens from the glyph, not
// from anywhere in the field) and better in every other: typing straight into
// the field works, and the segments advance month to day to year on their own.

/** Keeps a date input's draft in step with the DOM when iOS changes the field
 *  without telling React.
 *
 *  The picker's Reset button reverts the field to the value it held when the
 *  picker opened and fires nothing (facebook/react#23299), so spinning to a new
 *  date and then pressing Reset leaves the draft holding a date the field is no
 *  longer showing, and Save would write it. Subscribing to the raw events
 *  rather than React's onChange, and re-reading on the next task, stops the two
 *  diverging.
 *
 *  What this deliberately does NOT do is make Reset empty the field. Reverting
 *  to the value already committed is the whole of what that button does on iOS,
 *  so it can never clear a date that is already there; the Clear button in each
 *  caption line is the only way. Checked 2026-08-20 after two attempts to "fix"
 *  Reset.
 */
function useNativeValueSync(value: string, onChange: (value: string) => void) {
  const ref = useRef<HTMLInputElement>(null);
  // Latest-ref pattern, as in useModalChrome: the listener reads through this
  // so the subscribe effect never needs to re-run.
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });

  useEffect(() => {
    const input = ref.current;
    if (input === null) return;

    const sync = () => {
      setTimeout(() => {
        if (!input.isConnected) return;
        if (input.value !== latest.current.value) latest.current.onChange(input.value);
      }, 0);
    };

    input.addEventListener("change", sync);
    input.addEventListener("blur", sync);
    return () => {
      input.removeEventListener("change", sync);
      input.removeEventListener("blur", sync);
    };
  }, []);

  return ref;
}

type SessionDateFieldsProps = {
  startDate: string;
  endDate: string;
  onChangeStart: (value: string) => void;
  onChangeEnd: (value: string) => void;
  disabled: boolean;
  /** Disables the "To" field alone, for a caller whose own control has already
   *  answered "does this session have an end?" — the play history's "I'm still
   *  playing this" checkbox. Optional: the edit form has no such control and
   *  leaves both fields live. */
  endDisabled?: boolean;
  /** What is wrong with the dates right now, or null. Rendered as the fields'
   *  description so the reason a disabled Save is disabled is announced, not
   *  just shown. */
  problem: string | null;
};

// The date half of a play session, as a controlled draft. Deliberately holds no
// state and performs no write: the dialog's single Save owns both. Extracted so
// the fields cannot drift between the places a session can be logged.
export function SessionDateFields({
  startDate,
  endDate,
  onChangeStart,
  onChangeEnd,
  disabled,
  endDisabled = false,
  problem,
}: SessionDateFieldsProps) {
  const startRef = useNativeValueSync(startDate, onChangeStart);
  const endRef = useNativeValueSync(endDate, onChangeEnd);
  const startId = useId();
  const endId = useId();
  const problemId = useId();

  // Clear rode in a row of its own under the fields, which appeared the moment
  // a date was set and grew the card by 30px mid-edit. On a phone that pushed
  // the buttons below the fold only AFTER the first interaction, so the card
  // looked like it fit right up until it did not. In the caption line the
  // control costs no height at all and the card stops resizing under the user.
  const clearable = !disabled;

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className={fieldColumnClass}>
          <div className={captionRowClass}>
            <label htmlFor={startId}>From</label>
            {clearable && startDate !== "" && (
              <button type="button" onClick={() => onChangeStart("")} className={clearButtonClass}>
                Clear
              </button>
            )}
          </div>
          <input
            id={startId}
            ref={startRef}
            type="date"
            value={startDate}
            max={localToday()}
            disabled={disabled}
            onChange={(e) => onChangeStart(e.target.value)}
            aria-invalid={problem !== null}
            aria-describedby={problem === null ? undefined : problemId}
            className={dateInputClass}
          />
        </div>
        <div className={fieldColumnClass}>
          <div className={`${captionRowClass}${endDisabled ? " opacity-50" : ""}`}>
            <label htmlFor={endId}>To</label>
            {clearable && !endDisabled && endDate !== "" && (
              <button type="button" onClick={() => onChangeEnd("")} className={clearButtonClass}>
                Clear
              </button>
            )}
          </div>
          <input
            id={endId}
            ref={endRef}
            type="date"
            value={endDate}
            min={startDate || undefined}
            max={localToday()}
            disabled={disabled || endDisabled}
            onChange={(e) => onChangeEnd(e.target.value)}
            aria-invalid={problem !== null}
            aria-describedby={problem === null ? undefined : problemId}
            className={dateInputClass}
          />
        </div>
      </div>
      {/* Only the error. The standing hint this replaced described a rule the
          form does not enforce, and held a line open under the fields for it in
          every edit. aria-describedby is pointed here only while it exists, so
          it never references a missing node. */}
      {problem !== null && (
        <p id={problemId} className="mt-1.5 text-[11px] text-shelf-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
