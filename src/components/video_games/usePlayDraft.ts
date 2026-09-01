"use client";

import { useState } from "react";
import { localToday } from "@/lib/games";
import { useSessionDraft, type SessionDraft } from "./useSessionDraft";
import type { PlayedChoice } from "./playChoices";

/** The choice plus the dates it implies, as one thing every surface that logs
 *  a playthrough holds and sends. `session` is the same draft as before, so
 *  the rules about valid dates are not restated here: this hook owns only the
 *  choice, and the transitions between choices. */
export type PlayDraft = {
  choice: PlayedChoice;
  choose: (choice: PlayedChoice) => void;
  session: SessionDraft;
  reset: () => void;
};

type PlayDraftOptions = {
  /** Open on "played it before", dated today, for a caller whose own control
   *  already asserted a past playthrough ("Played?"). */
  startToday?: boolean;
  /** The game already has an open session that this Save will not close, so
   *  "currently playing" would be a 409. See useSessionDraft. */
  blockedByOpenSession?: boolean;
};

export function usePlayDraft({
  startToday = false,
  blockedByOpenSession = false,
}: PlayDraftOptions = {}): PlayDraft {
  const [choice, setChoice] = useState<PlayedChoice>(startToday ? "before" : "no");
  const session = useSessionDraft({
    startToday,
    blockedByOpenSession,
    // Any choice but the neutral one asserts that a playthrough exists, so a
    // blank start date becomes an error rather than silently sending nothing.
    required: choice !== "no",
  });

  const choose = (next: PlayedChoice) => {
    setChoice(next);
    if (next === "no") {
      // Clears the dates too: leaving them would send a playthrough the form no
      // longer shows.
      session.reset();
      return;
    }
    session.setStillPlaying(next === "now");
    // A tap is an assertion, unlike the neutral state this form opens in, so
    // "currently playing" fills in the only date it needs and the common case
    // is one tap. Only when empty, so a date already typed under "played it
    // before" survives the switch.
    if (next === "now" && session.startDate === "") session.setStartDate(localToday());
  };

  return {
    choice,
    choose,
    session,
    // Always back to neutral, never to `startToday`'s opening choice: reset
    // means "nothing pending", and returning to a choice with no date would
    // put a validation error on a form that was just saved.
    reset: () => {
      setChoice("no");
      session.reset();
    },
  };
}
