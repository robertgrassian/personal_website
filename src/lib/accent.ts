// Which accent the site wears. Change ACTIVE_ACCENT and everything follows:
// links, the filled primary button, tab underlines, focus rings, the CRT
// eyebrow, and the OG social image.
//
// The switch is a constant rather than a commented-out block so that the
// eventual "let a user pick their library's accent" feature has something to
// set: swap ACTIVE_ACCENT for a value read per request, and the only other
// change is where layout.tsx puts the attribute.
//
// The CSS side of each palette lives in globals.css, keyed by the same names
// on `[data-accent]`. This file exists because Satori renders the OG images
// with no browser and therefore no var() resolution, so a JS copy of the hexes
// is unavoidable. The two must move together, which is why the names are here
// rather than spelled out at each call site.

export const ACCENTS = {
  // Amber with the neon taken out. Keeps every reason the accent was warm in
  // the first place: it is a metal, and it belongs on the walnut shelf.
  brass: {
    light: "#8f6212",
    dark: "#d9a441",
  },
  // Grey-green. Deliberately low saturation and off the yellow end of green:
  // at 35% saturation and hue 82 it reads as pea rather than as sage, which is
  // the failure mode to check for if these are ever retuned.
  sage: {
    light: "#4a6540",
    dark: "#7f9e78",
  },
} as const;

export type AccentName = keyof typeof ACCENTS;

export const ACTIVE_ACCENT: AccentName = "sage";
