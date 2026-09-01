/** Whether a game has been played, and whether the playthrough has ended.
 *
 *  "now" and "before" are one playthrough either way; they differ only in
 *  whether it has an end date. "no" is offered where the surface is asking
 *  about the game (the add form, a promote) rather than adding a row to a
 *  history that already exists.
 *
 *  Kept as named choices rather than as the raw `stillPlaying` flag because
 *  "no end date yet" is a statement worth making explicitly: as a checkbox,
 *  not answering and answering no looked identical. */
export type PlayedChoice = "no" | "now" | "before";

/** The labels, in their own leaf module because three places need the same
 *  words: the buttons in `PlayedFields`, and the two messages in
 *  `useSessionDraft` that have to name the control to press. That hook renders
 *  no control of its own, so the string cannot live there. */
export const PLAY_CHOICE_LABELS: Record<PlayedChoice, string> = {
  no: "Not yet",
  now: "Currently playing",
  before: "Played it before",
};
