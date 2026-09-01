"use client";

import { buttonClass, ghostButtonClass } from "./formStyles";

type StopPlayingControlProps = {
  stopPending: boolean;
  onChange: (pending: boolean) => void;
  disabled: boolean;
};

// Stop a playthrough, or say it is already staged to stop. Rendered by BOTH of
// the card's faces: the flag lives in GameEditFields and survives switching
// between them, so a face that showed a "Stop Playing" button while a stop was
// already pending would offer to do a thing that was done, and hide the only
// way to take it back.
//
// Nothing here writes. Like every other edit on the card, the press stages and
// Save commits, which is what makes Undo possible at all.
export function StopPlayingControl({ stopPending, onChange, disabled }: StopPlayingControlProps) {
  if (!stopPending) {
    return (
      <button
        type="button"
        onClick={() => onChange(true)}
        disabled={disabled}
        className={buttonClass}
      >
        Stop Playing
      </button>
    );
  }

  return (
    <p className="text-xs text-shelf-text">
      Will be marked finished today when you save.{" "}
      <button
        type="button"
        onClick={() => onChange(false)}
        disabled={disabled}
        className={ghostButtonClass}
      >
        Undo
      </button>
    </p>
  );
}
