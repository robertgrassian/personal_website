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
  // Green, held at hue ~105 so it cannot drift yellow: at hue 82 it reads as
  // pea rather than sage, which is the failure mode to check for first if
  // these are ever retuned.
  //
  // The two schemes carry very different saturations on purpose. In light mode
  // the accent is forced dark, because it is both link text on white and the
  // fill under white button text, and a dark color only reads as a HUE if it
  // is saturated: at 22% it was indistinguishable from black. Dark mode has
  // the opposite problem, where saturation is what tips green into pea, so it
  // stays lower and buys its presence from lightness instead.
  sage: {
    light: "#417a2e",
    dark: "#8dbb81",
  },
} as const;

export type AccentName = keyof typeof ACCENTS;

export const ACTIVE_ACCENT: AccentName = "sage";
