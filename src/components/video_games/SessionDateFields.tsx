"use client";

import { localToday } from "@/lib/games";
import { fieldClass, ghostButtonClass, labelClass } from "./formStyles";

// Date inputs size to their content rather than filling the row, so they take
// the shared tokens plus their own padding instead of `inputClass`.
const dateInputClass = `${fieldClass} px-2 py-1`;

// Deliberately NO showPicker() call on click. Calling it from an onClick
// fights the browser: clicking the calendar glyph already opens the picker
// natively, so the handler fired a second time and the picker flickered shut.
// Native behaviour is worse in one way (the calendar opens from the glyph, not
// from anywhere in the field) and better in every other: typing straight into
// the field works, and the segments advance month to day to year on their own.

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
  // A controlled input's value is whatever state says, so any clear the browser
  // performs without React hearing an event is written straight back and the
  // press looks dead. That is what the mobile picker's own Reset button hits.
  // Re-reading the DOM on blur makes the field converge on what the user did
  // instead of silently reverting.
  const syncFromDom = (current: string, onChange: (value: string) => void) => {
    return (e: React.FocusEvent<HTMLInputElement>) => {
      if (e.target.value !== current) onChange(e.target.value);
    };
  };

  const showClear = !disabled && (startDate !== "" || endDate !== "");

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className={labelClass}>
          From
          <input
            type="date"
            value={startDate}
            max={localToday()}
            disabled={disabled}
            onChange={(e) => onChangeStart(e.target.value)}
            onBlur={syncFromDom(startDate, onChangeStart)}
            aria-invalid={problem !== null}
            aria-describedby="session-date-help"
            className={dateInputClass}
          />
        </label>
        <label className={labelClass}>
          To
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            max={localToday()}
            disabled={disabled}
            onChange={(e) => onChangeEnd(e.target.value)}
            onBlur={syncFromDom(endDate, onChangeEnd)}
            aria-invalid={problem !== null}
            aria-describedby="session-date-help"
            className={dateInputClass}
          />
        </label>
      </div>
      {/* The in-app way to empty a field. Needed because the platform picker's
          Reset is unreliable above, and because "clear the end date" is
          literally what the validation message below asks the user to do. */}
      {showClear && (
        // py-1.5 buys a touch-sized hit area on a 12px label; the row's own
        // margin is trimmed to match so the spacing below the fields is
        // unchanged.
        <div className="mt-0.5 flex flex-wrap items-center gap-x-4">
          {startDate !== "" && (
            <button
              type="button"
              onClick={() => onChangeStart("")}
              className={`py-1.5 ${ghostButtonClass}`}
            >
              Clear “From”
            </button>
          )}
          {endDate !== "" && (
            <button
              type="button"
              onClick={() => onChangeEnd("")}
              className={`py-1.5 ${ghostButtonClass}`}
            >
              Clear “To”
            </button>
          )}
        </div>
      )}
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
