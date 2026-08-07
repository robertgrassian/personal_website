"use client";

import { useState, type ReactNode } from "react";
import { buttonClass, dangerButtonClass, dangerLinkClass } from "./formStyles";

// A destructive action behind a two-step confirm: a quiet red link that swaps
// itself for a prompt plus Remove / Cancel.
//
// The step state lives here rather than in the parent. It is only ever read by
// this markup, and hoisting it gave each modal a `deleteStep` boolean to
// declare, reset and thread through — state whose scope was already exactly one
// subtree.
//
// Why the trigger is a link and the confirm is an outlined button rather than a
// filled one: the destructive path should never be the most prominent control
// in a dialog, and a filled red button beside a neutral Cancel reads as the
// default action.

type ConfirmStepProps = {
  /** The link text that opens the confirm, e.g. "Remove from library". */
  triggerLabel: string;
  /** The question, as nodes so callers can bold the item's name and append
   *  consequences (EditGameModal warns about cascading play sessions). */
  prompt: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** Extra classes for the trigger, for the callers that need `mt-3 block`. */
  triggerClassName?: string;
};

export function ConfirmStep({
  triggerLabel,
  prompt,
  confirmLabel,
  onConfirm,
  disabled = false,
  triggerClassName = "",
}: ConfirmStepProps) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={disabled}
        className={`${triggerClassName} ${dangerLinkClass}`.trim()}
      >
        {triggerLabel}
      </button>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-sm text-shelf-text">{prompt}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onConfirm} disabled={disabled} className={dangerButtonClass}>
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={disabled}
          className={buttonClass}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
