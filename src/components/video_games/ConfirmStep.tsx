"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClass, dangerButtonClass, dangerSubtleButtonClass } from "./formStyles";

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
  /** "outlined" standalone; "subtle" is smaller and tinted, for a trigger
   *  sharing a row with a Save that must stay the default action. */
  triggerVariant?: "outlined" | "subtle";
  /** Where the confirm renders. "inline" replaces the trigger and grows the
   *  container, which is right on a page that can simply get taller. "overlay"
   *  keeps the trigger's box and floats the prompt over the form instead, for
   *  the detail card: it sizes to its content, so an in-flow confirm resizes
   *  the whole case mid-interaction. **The overlay anchors to the nearest
   *  positioned ancestor, so that call site's container must be `relative`.** */
  layout?: "inline" | "overlay";
  /** Fires as the confirm opens and closes. For a call site that has to retire
   *  a control the overlay covers: GameEditFields disables Save, which would
   *  otherwise still be reachable by Tab from behind the panel. */
  onConfirmingChange?: (confirming: boolean) => void;
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
  triggerVariant = "outlined",
  layout = "inline",
  onConfirmingChange,
}: ConfirmStepProps) {
  const [confirming, setConfirming] = useState(false);
  const overlay = layout === "overlay";
  const panelRef = useRef<HTMLDivElement>(null);

  const open = () => {
    setConfirming(true);
    onConfirmingChange?.(true);
  };

  const cancel = () => {
    setConfirming(false);
    onConfirmingChange?.(false);
    onCancel?.();
  };

  // The overlay leaves the trigger mounted but invisible, so focus would
  // otherwise sit on a control the user can no longer see. Focus the panel
  // rather than a button inside it: Cancel would read as the suggested action
  // and the confirm must never be pre-focused.
  useEffect(() => {
    if (overlay && confirming) panelRef.current?.focus();
  }, [overlay, confirming]);

  const trigger = (
    <button
      type="button"
      onClick={open}
      disabled={disabled}
      // invisible, not unmounted: visibility:hidden keeps the button's box, so
      // the row it sits in stays exactly as tall as before, and drops it out of
      // the tab order at the same time.
      className={`${triggerClassName} ${
        triggerVariant === "subtle" ? dangerSubtleButtonClass : dangerButtonClass
      } ${overlay && confirming ? "invisible" : ""}`.trim()}
    >
      {triggerLabel}
    </button>
  );

  const panel = (
    <div
      ref={panelRef}
      // Script-focusable only, like the card's own dialog container.
      tabIndex={-1}
      className={
        overlay
          ? // Out of flow, so nothing here can change the card's height. Bottom
            // of the container it anchors to, growing upward over the form.
            "absolute inset-x-0 bottom-0 z-20 rounded-lg border border-shelf-plank " +
            "bg-shelf-bg/95 p-3 shadow-xl focus:outline-none"
          : "mt-3 w-full focus:outline-none"
      }
    >
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
        <button type="button" onClick={cancel} disabled={disabled} className={buttonClass}>
          Cancel
        </button>
      </div>
    </div>
  );

  if (overlay) {
    return (
      <>
        {trigger}
        {confirming && panel}
      </>
    );
  }

  return confirming ? panel : trigger;
}
