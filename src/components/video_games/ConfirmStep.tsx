"use client";

import { useState, type ReactNode } from "react";
import { buttonClass, dangerButtonClass } from "./formStyles";

// A destructive action behind a two-step confirm: a quiet red link that swaps
// itself for a prompt plus Remove / Cancel.
//
// The step state lives here rather than in the parent, because this markup is
// the only thing that reads it. Hoisting it would give each modal a boolean to
// declare and reset for no benefit.
//
// The trigger is a real button rather than the small text link it used to be:
// a control that is genuinely hard to hit is not safer, it is just annoying,
// and the confirm step is what makes a mis-tap harmless. Both halves stay
// OUTLINED rather than filled, which is what keeps the destructive path from
// reading as the dialog's default action.

type ConfirmStepProps = {
  /** The link text that opens the confirm, e.g. "Remove from library". */
  triggerLabel: string;
  /** The question, as nodes so callers can bold the item's name and append
   *  consequences (GameEditFields warns about cascading play sessions). */
  prompt: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  /** Called when the confirm is dismissed, for callers holding state that must
   *  not survive a reopen — the account delete clears its typed confirmation,
   *  which would otherwise come back pre-filled and valid. */
  onCancel?: () => void;
  /** Disables every control, including Cancel. For in-flight requests. */
  disabled?: boolean;
  /** Disables ONLY the confirm, leaving Cancel usable. For a caller whose
   *  prompt contains a gate the user has not satisfied yet — the account
   *  delete makes you type your username. Backing out must always stay
   *  available, which is why this is separate from `disabled`. */
  confirmDisabled?: boolean;
  /** Extra classes for the trigger, for the callers that need `mt-3 block`. */
  triggerClassName?: string;
};

export function ConfirmStep({
  triggerLabel,
  prompt,
  confirmLabel,
  onConfirm,
  onCancel,
  disabled = false,
  confirmDisabled = false,
  triggerClassName = "",
}: ConfirmStepProps) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={disabled}
        className={`${triggerClassName} ${dangerButtonClass}`.trim()}
      >
        {triggerLabel}
      </button>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-sm text-shelf-text">{prompt}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled || confirmDisabled}
          className={dangerButtonClass}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            onCancel?.();
          }}
          disabled={disabled}
          className={buttonClass}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
