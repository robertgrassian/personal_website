"use client";

import { useEffect, useRef } from "react";
import { localToday } from "@/lib/games";
import { fieldClass, labelClass } from "./formStyles";

// Date inputs size to their content rather than filling the row, so they take
// the shared tokens plus their own padding instead of `inputClass`.
const dateInputClass = `${fieldClass} px-2 py-1`;

// Deliberately NO showPicker() call on click. Calling it from an onClick
// fights the browser: clicking the calendar glyph already opens the picker
// natively, so the handler fired a second time and the picker flickered shut.
// Native behaviour is worse in one way (the calendar opens from the glyph, not
// from anywhere in the field) and better in every other: typing straight into
// the field works, and the segments advance month to day to year on their own.

/** Keeps a date input's draft in step with the DOM when the browser changes the
 *  field behind React's back, which is what the picker's own Reset button does
 *  on iOS.
 *
 *  React's onChange cannot see that press. WebKit dispatches change while the
 *  element still holds the OLD value and commits the clear afterwards
 *  (facebook/react#8938), and React only calls onChange when the value has
 *  already moved, so it drops the event and the field keeps the stale date.
 *  A native listener is not filtered that way, and re-reading on the next task
 *  runs after WebKit has committed. Reset then clears the field on its own,
 *  with no second control needed beside it.
 *
 *  blur is listened to as well, for a browser that mutates the value without
 *  dispatching anything at all: the correction lands when the picker closes
 *  rather than never. */
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
  problem,
}: SessionDateFieldsProps) {
  const startRef = useNativeValueSync(startDate, onChangeStart);
  const endRef = useNativeValueSync(endDate, onChangeEnd);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className={labelClass}>
          From
          <input
            ref={startRef}
            type="date"
            value={startDate}
            max={localToday()}
            disabled={disabled}
            onChange={(e) => onChangeStart(e.target.value)}
            aria-invalid={problem !== null}
            aria-describedby="session-date-help"
            className={dateInputClass}
          />
        </label>
        <label className={labelClass}>
          To
          <input
            ref={endRef}
            type="date"
            value={endDate}
            min={startDate || undefined}
            max={localToday()}
            disabled={disabled}
            onChange={(e) => onChangeEnd(e.target.value)}
            aria-invalid={problem !== null}
            aria-describedby="session-date-help"
            className={dateInputClass}
          />
        </label>
      </div>
      <p
        id="session-date-help"
        className={`mt-1.5 text-[11px] ${
          problem === null ? "text-shelf-text-muted" : "text-red-600 dark:text-red-400"
        }`}
      >
        {problem ?? "Leave “To” empty if you’re still playing it."}
      </p>
    </div>
  );
}
