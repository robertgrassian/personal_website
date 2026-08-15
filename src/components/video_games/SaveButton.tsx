"use client";

import type { ReactNode } from "react";
import { saveButtonClass } from "./formStyles";

// The one Save button for every owner edit that buffers a draft and commits it
// explicitly (rating, system, wishlist notes, logged sessions). Shared as a
// component rather than only as a class string so the `type="button"` and the
// disabled-while-pending contract come with it: these all live inside modals,
// where a stray submit button would do something surprising.

type SaveButtonProps = {
  onClick: () => void;
  /** True while a write is in flight, or while the draft is not valid to send. */
  disabled?: boolean;
  /** Defaults to "Save". Qualify it ("Save rating") wherever a dialog can show
   *  more than one at a time. */
  children?: ReactNode;
  /** Positional classes only (`mt-2`, `block`); appearance comes from the recipe. */
  className?: string;
};

export function SaveButton({
  onClick,
  disabled = false,
  children = "Save",
  className = "",
}: SaveButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${className} ${saveButtonClass}`.trim()}
    >
      {children}
    </button>
  );
}
