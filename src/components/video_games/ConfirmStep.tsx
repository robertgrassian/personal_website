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
   *  container, which is right on a page that can simply get taller. "sheet"
   *  keeps the trigger's box and raises the prompt from the bottom edge of the
   *  detail card instead: that card sizes to its content, so an in-flow confirm
   *  resizes the whole case mid-interaction.
   *
   *  The sheet is `absolute` with no positioned ancestor of its own, so it
   *  anchors to the card's dialog element and reaches its edges from anywhere
   *  in the form. **A call site using it must not introduce a `relative`
   *  ancestor between here and that element**, which would re-anchor the sheet
   *  to some box in the middle of the form. */
  layout?: "inline" | "sheet";
  /** Fires as the confirm opens and closes. For a call site that has to retire
   *  a control the sheet covers: GameEditFields disables Save, which would
   *  otherwise still be reachable by Tab from behind the sheet. */
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
  const sheet = layout === "sheet";
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

  // The sheet leaves the trigger mounted but invisible, so focus would
  // otherwise sit on a control the user can no longer see. Focus the panel
  // rather than a button inside it: Cancel would read as the suggested action
  // and the confirm must never be pre-focused.
  useEffect(() => {
    if (sheet && confirming) panelRef.current?.focus();
  }, [sheet, confirming]);

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
      } ${sheet && confirming ? "invisible" : ""}`.trim()}
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
        sheet
          ? // Out of flow, so nothing here can change the card's height, and
            // pinned to the case's bottom edge rather than scrolling with the
            // form. No radius of its own: the surface clips it to the case's
            // rounded corners.
            //
            // Frosted rather than a solid panel, the same recipe as the nav,
            // the homepage tiles and the library's sticky header: a scrim plus
            // backdrop-blur. It is also what the back of the case already is (a
            // blurred cover under a dark overlay), so the sheet reads as that
            // surface deepening rather than as a second material laid on it.
            // The blur is what obscures the form behind, which a scrim alone
            // only ghosted.
            "game-card-confirm absolute inset-x-0 bottom-0 z-30 border-t border-shelf-plank " +
            "bg-black/45 backdrop-blur-md px-5 py-4 focus:outline-none"
          : "mt-3 w-full focus:outline-none"
      }
    >
      <p className="text-sm text-shelf-text">{prompt}</p>
      <div className="mt-3 flex gap-2">
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

  if (sheet) {
    return (
      <>
        {trigger}
        {confirming && panel}
      </>
    );
  }

  return confirming ? panel : trigger;
}
