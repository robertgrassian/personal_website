"use client";

import { useId } from "react";
import { labelClass } from "./formStyles";
import { SessionDateFields } from "./SessionDateFields";
import { PLAY_CHOICE_LABELS, type PlayedChoice } from "./playChoices";
import type { PlayDraft } from "./usePlayDraft";
import { toggleClasses } from "@/components/ui/buttonStyles";

const CHOICES: PlayedChoice[] = ["no", "now", "before"];

type PlayedFieldsProps = {
  play: PlayDraft;
  /** Names the button group. Every surface asks the same question; only the
   *  add form has room to ask it out loud, so the others hide it behind the
   *  heading they already have. */
  label: string;
  labelHidden?: boolean;
  /** What the neutral choice is called here. It is the same answer either way
   *  (no playthrough to log), but "Not yet" is wrong on a game whose history
   *  already lists three of them. */
  neutralLabel?: string;
  disabled: boolean;
};

// Whether a game has been played, and when: the choice, plus the dates that go
// with the answers that have any. The one control for this across all three
// places a playthrough can be logged.
//
// Deliberately NOT the card's play-history face. That face exists to list the
// sessions a game already has, and two of the three callers have none to list,
// so putting this behind the same "view or add" navigation would add a step to
// flows that have no reason for one.
//
// "Session" is the database's word and appears nowhere here, per the same rule
// the rest of the library follows.
export function PlayedFields({
  play,
  label,
  labelHidden = false,
  neutralLabel = PLAY_CHOICE_LABELS.no,
  disabled,
}: PlayedFieldsProps) {
  const labelId = useId();
  return (
    <div>
      {!labelHidden && (
        <p id={labelId} className={labelClass}>
          {label}
        </p>
      )}
      {/* aria-pressed toggles rather than a radiogroup, matching RatingPicker:
          the same "picking one deselects the others" shape, without the
          arrow-key navigation a radiogroup promises and this does not
          implement.

          The group names itself from the visible heading when there is one, and
          carries the text itself when there is not. Setting both would announce
          the question twice: once as the group's name, once as the paragraph. */}
      <div
        role="group"
        aria-labelledby={labelHidden ? undefined : labelId}
        aria-label={labelHidden ? label : undefined}
        className={`grid grid-cols-3 gap-1.5 ${labelHidden ? "" : "mt-1"}`}
      >
        {CHOICES.map((value) => {
          const active = play.choice === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => play.choose(value)}
              className={
                // Taller on touch: three choices across a phone are narrow
                // enough already without being 28px high. leading-tight because
                // the longest label wraps to two lines there, and the grid
                // makes all three that tall when one is.
                "rounded-md border px-2 py-2 pointer-fine:py-1.5 text-xs leading-tight " +
                "transition-colors cursor-pointer " +
                "disabled:opacity-50 disabled:cursor-default " +
                toggleClasses(active)
              }
            >
              {value === "no" ? neutralLabel : PLAY_CHOICE_LABELS[value]}
            </button>
          );
        })}
      </div>
      {/* The dates mount only for an answer that has any, so "Not yet" is the
          short form of this section rather than a set of disabled fields. */}
      {play.choice !== "no" && <SessionDateFields draft={play.session} disabled={disabled} />}
    </div>
  );
}
