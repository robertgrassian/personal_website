"use client";

import { useId } from "react";
import { formatDayShort } from "@/lib/dates";
import { Button } from "@/components/ui/Button";
import { DateField, FixedDate } from "./SessionDateFields";

/** What is wrong with a staged stop's end date, or null. Same wording as the
 *  add form's rules in useSessionDraft, since it is the same field. */
export function stopDateProblem(stopDate: string, startDate: string): string | null {
  if (stopDate === "") return "Add the date you finished.";
  if (stopDate < startDate) return "The end date is before the start date.";
  return null;
}

type FinishingPlaythroughProps = {
  // The open session's start, ISO. Shown, not editable: closing a session
  // (PATCH /me/sessions/{id}) can only set its end.
  startDate: string;
  stopDate: string;
  onStopDateChange: (value: string) => void;
  onUndo: () => void;
  disabled: boolean;
};

// A staged "Stop Playing", drawn as the playthrough it will save: the start
// already on record and an end date that opens on today. The stop used to be a
// line of text with an Undo, the one pending edit with no control showing its
// state; now it is the same From/To fields the add form uses, so changing the
// end is how you say you finished a few days ago, and Keep Playing puts it back.
//
// Bordered in the accent of an active toggle, matching the selected
// "Played it before" choice that draws the same two fields.
export function FinishingPlaythrough({
  startDate,
  stopDate,
  onStopDateChange,
  onUndo,
  disabled,
}: FinishingPlaythroughProps) {
  const problemId = useId();
  const problem = stopDateProblem(stopDate, startDate);
  return (
    <div className="rounded-md border border-link p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-shelf-text">Finishing this playthrough</p>
        <Button variant="ghost" onClick={onUndo} disabled={disabled}>
          Keep Playing
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <FixedDate label="From">{formatDayShort(startDate)}</FixedDate>
        <DateField
          label="To"
          value={stopDate}
          onChange={onStopDateChange}
          min={startDate}
          disabled={disabled}
          clearable={false}
          problemId={problem === null ? undefined : problemId}
        />
      </div>
      {problem === null ? (
        <p className="mt-2 text-[11px] text-shelf-text-muted">
          Finished on another day? Change the end date. Logged when you save.
        </p>
      ) : (
        <p id={problemId} className="mt-2 text-[11px] text-shelf-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
