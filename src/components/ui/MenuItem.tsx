import Link from "next/link";
import type { ComponentPropsWithoutRef, MouseEventHandler, ReactNode } from "react";

import { menuItemClass } from "./buttonStyles";

type MenuItemProps = {
  children: ReactNode;
  className?: string;
  /** Present for a navigation row, absent for one that runs an action. */
  href?: string;
  /** Off-site, so a plain <a> in a new tab rather than a client-side Link. */
  external?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
} & Omit<ComponentPropsWithoutRef<"a">, "href" | "onClick" | "className" | "children">;

/** One row of the library header's menu. Polymorphic over <button>, next/link
 *  and <a> so that a mixed list reads as one thing by construction: it used to
 *  be a shared class string, which three call sites had to remember to import
 *  and one had already drifted from. */
export function MenuItem({ href, external, className = "", children, ...rest }: MenuItemProps) {
  const classes = `${menuItemClass} ${className}`.trim();

  if (href !== undefined && external) {
    return (
      // Without noopener the opened tab holds a window.opener handle back to
      // this one and can navigate it elsewhere.
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
        {children}
      </a>
    );
  }

  if (href !== undefined) {
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  // The cast narrows the anchor props above to the button's. The two elements
  // differ only in their event target type, and no call site passes a handler
  // that reads it.
  return (
    <button type="button" className={classes} {...(rest as ComponentPropsWithoutRef<"button">)}>
      {children}
    </button>
  );
}
