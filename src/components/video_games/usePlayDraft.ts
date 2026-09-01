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
  /** Whether "Not yet" is one of the choices, which is what decides between a
   *  three-button and a two-button control. */
  offersNotYet: boolean;
  session: SessionDraft;
  reset: () => void;
};

type PlayDraftOptions = {
  /** Offer "Not yet", and treat any other choice as asserting that a
   *  playthrough exists. False on a surface that is already "add an entry to
   *  this game's history", where "not yet" is not an answer to anything and
   *  leaving the dates blank is how you decline. */
  offerNotYet?: boolean;
  /** Start dated today, for a caller whose own control already asserted the
   *  playthrough ("Played?"). */
  startToday?: boolean;
  /** The game already has an open session that this Save will not close, so
   *  "Playing it now" would be a 409. See useSessionDraft. */
  blockedByOpenSession?: boolean;
};

export function usePlayDraft({
  offerNotYet = false,
  startToday = false,
  blockedByOpenSession = false,
}: PlayDraftOptions = {}): PlayDraft {
  // "before" where "Not yet" is not offered: a history form opens with the To
  // field showing and nothing selected for you, which is what it did when this
  // was a checkbox.
  const initialChoice: PlayedChoice = offerNotYet ? "no" : "before";
  const [choice, setChoice] = useState<PlayedChoice>(initialChoice);
  const session = useSessionDraft({
    startToday,
    blockedByOpenSession,
    // Picking anything but "Not yet" asserts there IS a playthrough, so a blank
    // start date becomes an error rather than silently sending nothing. Without
    // the "Not yet" choice there is nothing to have asserted: blank dates mean
    // no playthrough, exactly as they always have.
    required: offerNotYet && choice !== "no",
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
    // "Playing it now" is meant to be one tap, so it fills in the only date it
    // needs. Only when empty, so a date already typed under "Played it before"
    // survives the switch.
    if (next === "now" && session.startDate === "") session.setStartDate(localToday());
  };

  return {
    choice,
    choose,
    offersNotYet: offerNotYet,
    session,
    reset: () => {
      setChoice(initialChoice);
      session.reset();
    },
  };
}
