"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { localToday } from "@/lib/games";
import { Button } from "@/components/ui/Button";
import { fieldClass } from "./formStyles";
import type { SessionDraft } from "./useSessionDraft";

// Date inputs size to their content rather than filling the row, so they take
// the shared tokens plus their own padding instead of `inputClass`.
//
// The disabled styling is load-bearing: a disabled date input drops its
// calendar glyph and changes nothing else, so the state read as a glitch.
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
const clearButtonClass = "-my-1.5 py-1.5 text-[10px] normal-case";

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

type DateFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  disabled: boolean;
  // Off where an empty date is never a valid answer, such as a stop's end date.
  clearable: boolean;
  problemId?: string;
};

/** One captioned date input. Shared with the stop-playing editor, so a date
 *  reads and behaves the same wherever a playthrough's dates are entered.
 *
 *  Clear rides in the caption line. In a row of its own under the fields it
 *  appeared the moment a date was set and grew the card by 30px mid-edit,
 *  which on a phone pushed the buttons below the fold only after the first
 *  interaction. */
export function DateField({
  label,
  value,
  onChange,
  min,
  disabled,
  clearable,
  problemId,
}: DateFieldProps) {
  const ref = useNativeValueSync(value, onChange);
  const id = useId();
  return (
    <div className={fieldColumnClass}>
      <div className={captionRowClass}>
        <label htmlFor={id}>{label}</label>
        {clearable && !disabled && value !== "" && (
          <Button variant="ghost" onClick={() => onChange("")} className={clearButtonClass}>
            Clear
          </Button>
        )}
      </div>
      <input
        id={id}
        ref={ref}
        type="date"
        value={value}
        min={min || undefined}
        max={localToday()}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={problemId !== undefined}
        aria-describedby={problemId}
        className={dateInputClass}
      />
    </div>
  );
}

/** The caption-and-value column of a date that is shown but not editable,
 *  aligned with a DateField beside it. */
export function FixedDate({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={fieldColumnClass}>
      <div className={captionRowClass}>{label}</div>
      {/* Border kept, transparent, so the text sits on the input's baseline. */}
      <p className="border border-transparent py-1 text-base pointer-fine:text-sm text-shelf-text">
        {children}
      </p>
    </div>
  );
}

type SessionDateFieldsProps = {
  // The whole draft rather than a field at a time: this renders every control
  // that can change it, so threading six props through would only give the two
  // call sites a way to wire them up differently.
  draft: SessionDraft;
  disabled: boolean;
};

// The dates of a play session being entered. Deliberately holds no state and
// performs no write — the draft owns the first and the dialog's single Save
// owns the second. Extracted so neither can drift between the places a session
// can be logged.
//
// It does NOT ask whether the session has ended: `PlayedFields`, its only
// caller, asks that as one of its choices and this reads the answer off the
// draft. The checkbox that used to sit below the fields was a second way to
// answer a question already on the screen.
export function SessionDateFields({ draft, disabled }: SessionDateFieldsProps) {
  const { startDate, endDate, stillPlaying, problem } = draft;
  const problemId = useId();
  const describedBy = problem === null ? undefined : problemId;

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-end gap-2">
        <DateField
          label="From"
          value={startDate}
          onChange={draft.setStartDate}
          disabled={disabled}
          clearable
          problemId={describedBy}
        />
        {/* Dropped from the layout rather than greyed out: "Playing it now"
            should show one date, not one date beside a disabled box asking
            when something that has not ended ended. The draft keeps a date
            already typed, so picking "Played it before" again puts it back. */}
        {!stillPlaying && (
          <DateField
            label="To"
            value={endDate}
            onChange={draft.setEndDate}
            min={startDate}
            disabled={disabled}
            clearable
            problemId={describedBy}
          />
        )}
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
