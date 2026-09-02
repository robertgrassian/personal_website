"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClass, dangerButtonClass } from "./formStyles";

// An action behind a two-step confirm: a quiet trigger that swaps itself for a
// prompt plus Confirm / Cancel. Red by default, since removes were the only
// callers for a long time; see `tone` for the neutral case.
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
  /** A failure from the action this confirm ran, shown with the question that
   *  caused it. The sheet layout covers the form's own error line, so a caller
   *  using it must pass the error here or a failed remove looks like nothing
   *  happened. */
  error?: string | null;
  /** Extra classes for the trigger, for the callers that need `mt-3 block`. */
  triggerClassName?: string;
  /** "danger" paints both halves red, for an action that destroys a row.
   *  "neutral" is the same two steps in the ordinary button colors, for one
   *  that is merely worth a second look: the currently-playing panel closes a
   *  session behind this, which ends something but deletes nothing, and red
   *  would overstate it next to the real removes. */
  tone?: "danger" | "neutral";
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
  error = null,
  triggerClassName = "",
  tone = "danger",
  layout = "inline",
  onConfirmingChange,
}: ConfirmStepProps) {
  const [confirming, setConfirming] = useState(false);
  const sheet = layout === "sheet";
  // One class for the trigger AND the confirm, so the two halves of a step
  // cannot disagree. They used to: the trigger had a tinted variant to keep a
  // Save beside it the default action, which the fill on Save now does by
  // itself.
  const actionClass = tone === "neutral" ? buttonClass : dangerButtonClass;
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Which way the step last moved, so the effect below can tell a close from
  // the first render, where focus belongs to whatever opened the dialog.
  const wasConfirming = useRef(false);

  const open = () => {
    setConfirming(true);
    onConfirmingChange?.(true);
  };

  const cancel = () => {
    setConfirming(false);
    onConfirmingChange?.(false);
    onCancel?.();
  };
  // Latest-ref so the dismiss effect below can stay keyed on `confirming`
  // alone, instead of re-binding its listener whenever the caller re-renders.
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;

  // Focus follows the step, in BOTH layouts: the trigger it replaced is either
  // invisible (sheet) or unmounted (inline), so focus would otherwise fall to
  // the document, and there is no focus trap to catch the next Tab. Inline
  // needs it at least as much, since that layout is used inside a scrolling
  // list of rows, where landing on the document loses your place entirely.
  // The panel takes focus rather than a button inside it, since Cancel would
  // read as the suggested action and the confirm must never be pre-focused.
  //
  // preventScroll on both moves: WebKit scrolls the DOCUMENT to reveal a newly
  // focused element, and this one is inside a `position: fixed` dialog, so the
  // scroll reveals nothing and instead raises the page behind the card and
  // leaves it raised. scrollLock's stage two is the other cure and is reserved
  // for fields that raise a keyboard, because it costs Safari its collapsed URL
  // bar; see docs/mobile-viewport.md.
  useEffect(() => {
    if (confirming) panelRef.current?.focus({ preventScroll: true });
    else if (wasConfirming.current) triggerRef.current?.focus({ preventScroll: true });
    wasConfirming.current = confirming;
  }, [confirming]);

  // A press anywhere on the card that is not the sheet backs out of it, which
  // is what a sheet's scrim would do if it had one.
  //
  // On the card, not the document: a press on the page backdrop keeps closing
  // the whole card rather than only dismissing the sheet. `pointerdown` rather
  // than `click`, so a control that stops click propagation cannot swallow it,
  // and so the sheet leaves on the press rather than the release. Presses on
  // the inert form region arrive here too, because an inert subtree retargets
  // its events to the nearest non-inert ancestor rather than swallowing them.
  useEffect(() => {
    if (!sheet || !confirming) return;
    const panel = panelRef.current;
    const card = panel?.closest('[role="dialog"]');
    if (!panel || !card) return;

    const dismiss = (event: Event) => {
      if (!panel.contains(event.target as Node)) cancelRef.current();
    };
    card.addEventListener("pointerdown", dismiss);
    return () => card.removeEventListener("pointerdown", dismiss);
  }, [sheet, confirming]);

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={open}
      disabled={disabled}
      // invisible, not unmounted: visibility:hidden keeps the button's box, so
      // the row it sits in stays exactly as tall as before, and drops it out of
      // the tab order at the same time.
      className={`${triggerClassName} ${actionClass} ${
        sheet && confirming ? "invisible" : ""
      }`.trim()}
    >
      {triggerLabel}
    </button>
  );

  const panel = (
    <div
      ref={panelRef}
      // Script-focusable so the effect above can move focus here. Not in the
      // tab order: -1 means reachable by script, skipped by Tab.
      tabIndex={-1}
      className={
        sheet
          ? // Out of flow, so nothing here can change the card's height, and
            // pinned to the case's bottom edge rather than scrolling with the
            // form. No radius of its own: the surface clips it to the case's
            // rounded corners. Frosted rather than solid, the same recipe as
            // the nav and the homepage tiles; the blur is what obscures the
            // form behind it, which a scrim alone only ghosted.
            "game-card-confirm absolute inset-x-0 bottom-0 z-30 border-t border-shelf-plank " +
            "bg-black/45 backdrop-blur-md px-5 py-4 focus:outline-none"
          : "mt-3 w-full focus:outline-none"
      }
    >
      <p className="text-sm text-shelf-text">{prompt}</p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-shelf-danger">
          {error}
        </p>
      )}
      <div className={`${sheet ? "mt-3" : "mt-2"} flex gap-2`}>
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled || confirmDisabled}
          className={actionClass}
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
