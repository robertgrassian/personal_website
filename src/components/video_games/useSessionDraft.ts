"use client";

import { useState } from "react";
import { localToday } from "@/lib/games";
import { PLAY_CHOICE_LABELS } from "./playChoices";

/** A play session being typed in, with every rule about what makes it valid.
 *  Held here rather than in each form because both places that log a session
 *  enforced the same four rules in their own copy, which is drift waiting to
 *  happen: `SessionDateFields` already exists to stop the inputs diverging, and
 *  this is the state half of the same job. */
export type SessionDraft = {
  startDate: string;
  endDate: string;
  stillPlaying: boolean;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  setStillPlaying: (value: boolean) => void;
  /** Whether a session has been entered at all. A draft with no start date is
   *  not a session, so a Save simply does not carry one. */
  dirty: boolean;
  /** What is wrong with the dates right now, or null. */
  problem: string | null;
  /** What to send with a Save, or undefined when nothing was entered. A null
   *  `endDate` is the open session that makes a game currently-playing. */
  value: { startDate: string; endDate: string | null } | undefined;
  reset: () => void;
};

type SessionDraftOptions = {
  /** Start dated today, for a caller whose own control already asserted the
   *  session ("Played?"). */
  startToday?: boolean;
  /** The game already has an open session that this Save will not close. A
   *  second one is a 409 from `create_my_session`, so it is refused here. */
  blockedByOpenSession?: boolean;
  /** The caller has already asserted that there IS a playthrough, so an empty
   *  start date is a problem rather than "no session". The add form's
   *  "Playing it now" / "Played it before" choice is the only such caller: the
   *  edit surfaces leave the dates blank to mean nothing was entered. */
  required?: boolean;
};

export function useSessionDraft({
  startToday = false,
  blockedByOpenSession = false,
  required = false,
}: SessionDraftOptions = {}): SessionDraft {
  const [startDate, setStartDate] = useState(startToday ? localToday() : "");
  const [endDate, setEndDate] = useState("");
  // The explicit form of "no end yet". An empty end date is still what reaches
  // the API; a blank field just is not an instruction anyone can see they gave.
  const [stillPlaying, setStillPlaying] = useState(false);

  const dirty = startDate !== "";
  // An end with no start is not "no session", it is a session whose start the
  // user has not given yet. Without this it silently vanished on Save, because
  // `dirty` is false and nothing was ever sent.
  const endWithoutStart = endDate !== "" && startDate === "";

  const problem = endWithoutStart
    ? "Add a start date, or clear the end date."
    : required && !dirty
      ? "Add the date you started."
      : dirty && !stillPlaying && endDate === ""
        ? `Add an end date, or pick '${PLAY_CHOICE_LABELS.now}'.`
        : dirty && !stillPlaying && endDate !== "" && endDate < startDate
          ? "The end date is before the start date."
          : dirty && stillPlaying && blockedByOpenSession
            ? `You are already playing this. Stop playing first, or pick '${PLAY_CHOICE_LABELS.before}'.`
            : null;

  return {
    startDate,
    endDate,
    stillPlaying,
    setStartDate,
    setEndDate,
    setStillPlaying,
    dirty,
    problem,
    value: dirty ? { startDate, endDate: stillPlaying ? null : endDate } : undefined,
    reset: () => {
      setStartDate("");
      setEndDate("");
      setStillPlaying(false);
    },
  };
}
