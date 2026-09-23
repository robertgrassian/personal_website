import type { ComponentPropsWithRef } from "react";

import { buttonClasses, type ButtonSize, type ButtonVariant } from "./buttonStyles";

type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/** Every button on the site. The variant is the whole styling decision: see
 *  buttonStyles.ts for the rule that assigns them.
 *
 *  No "use client" directive, because this renders markup and holds no state.
 *  It inherits whichever environment imports it, so a server component can use
 *  it for a plain submit and a client component can hang an onClick on it.
 *
 *  Layout stays at the call site (`mt-3`, `ml-auto`, `w-full`) via className,
 *  which is what the class strings this replaced were good at and a component
 *  must not lose. */
export function Button({
  variant = "secondary",
  size = "sm",
  className = "",
  // Defaulted, because HTML's default is "submit": a bare <button> inside a
  // form submits it, which is never what these call sites meant.
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${buttonClasses(variant, size)} ${className}`.trim()}
      {...rest}
    />
  );
}
