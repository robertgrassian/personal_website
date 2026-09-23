import type { ComponentPropsWithRef } from "react";

/** Which token family the surrounding surface uses. `shelf` also covers the
 *  detail card, whose .game-card-surface re-points those tokens for its dark
 *  scrim, so an icon there needs no colors of its own.
 *
 *  `library` is the header's own convention: everything interactive there
 *  highlights in the accent, matching the view tabs, the follow-count links
 *  menu rows this opens. */
type IconButtonTone = "shelf" | "page" | "library";

/** `touch` is the 44px target with a desktop shrink. It needs negative margins
 *  at the call site to stop it growing the row it sits in, which is layout and
 *  therefore stays local. `none` is for a call site with its own box. */
type IconButtonSize = "md" | "touch" | "none";

type IconButtonProps = Omit<ComponentPropsWithRef<"button">, "aria-label"> & {
  /** The accessible name. Required, not optional: an icon button has no text,
   *  so this is the only name it will ever have. */
  label: string;
  tone?: IconButtonTone;
  size?: IconButtonSize;
};

const toneClass: Record<IconButtonTone, string> = {
  shelf:
    "text-shelf-text-muted hover:bg-shelf-input hover:text-shelf-text " +
    "focus-visible:ring-shelf-input-ring",
  page: "text-muted hover:bg-divider hover:text-foreground focus-visible:ring-link",
  library:
    "text-shelf-text-muted hover:bg-shelf-input hover:text-link " +
    "duration-150 focus-visible:ring-shelf-input-ring",
};

const sizeClass: Record<IconButtonSize, string> = {
  md: "p-1.5",
  touch: "flex h-11 w-11 items-center justify-center sm:h-9 sm:w-9",
  none: "",
};

/** A close, back or menu glyph with a hit box. The icon goes in as a child, so
 *  each call site keeps control of its glyph size.
 *
 *  cursor-pointer lives here rather than on the icon: three of the buttons this
 *  replaced had it on the SVG, where it only applies over the glyph's own box
 *  and not over the padding around it. */
export function IconButton({
  label,
  tone = "shelf",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={`shrink-0 rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${toneClass[tone]} ${sizeClass[size]} ${className}`.trim()}
      {...rest}
    />
  );
}
