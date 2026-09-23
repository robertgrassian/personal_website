"use client";

import { Button } from "@/components/ui/Button";

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
      <Button onClick={() => onChange(true)} disabled={disabled}>
        Stop Playing
      </Button>
    );
  }

  return (
    <p className="text-xs text-shelf-text">
      Will be marked finished today when you save.{" "}
      <Button variant="ghost" onClick={() => onChange(false)} disabled={disabled}>
        Undo
      </Button>
    </p>
  );
}
