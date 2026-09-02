"use client";

import type { ReactNode } from "react";

type RequiredFieldProps = {
  /** True when the field has no value yet. */
  missing: boolean;
  children: ReactNode;
};

// Marks a required field that has not been filled in, by glowing the field
// itself. Wraps rather than takes a className so it works with any control,
// including SuggestInput, which owns its own input element.
//
// The accent, not red: an empty required field is unfinished, not wrong, and a
// dialog that opens already showing a red error is accusing the user of a
// mistake they have not made. Red is for a value that IS wrong.
//
// `rounded` matches fieldClass so the glow follows the input's own corners, and
// the ring is offset inward (`ring-offset-0` plus no padding) so it reads as
// the field lighting up rather than as a box drawn around it.
export function RequiredField({ missing, children }: RequiredFieldProps) {
  if (!missing) return <>{children}</>;
  return (
    // One pair of classes for both schemes now: --link and --accent-glow both
    // flip already, which the two hardcoded amber literals they replaced had
    // to do by hand with a dark: variant.
    <div className="rounded shadow-[0_0_0_3px_var(--accent-glow)] ring-1 ring-link">{children}</div>
  );
}
