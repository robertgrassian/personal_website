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
  // Green. Both values sit at OKLCH hue 140, which is a true green: the pea /
  // olive failure this went through twice lives nearer hue 110, so hue is the
  // dial to check first if these are ever retuned, not saturation.
  //
  // Chroma is what makes it read as a color rather than as a grey. Light mode
  // is the constrained scheme, because the accent is forced dark there (it is
  // link text on white AND the fill under white button text), and an earlier
  // pass answered "too pea" by dropping chroma in BOTH schemes. That was the
  // wrong axis: low chroma at low lightness is just black with a tint. These
  // values sit near the top of the sRGB gamut for their lightness, C 0.150 of
  // a possible ~0.165 light and 0.125 dark, which is where the presence comes
  // from. Contrast: 5.53:1 on white, 9.66:1 on the dark background.
  sage: {
    light: "#2b7815",
    dark: "#85c577",
  },
} as const;

export type AccentName = keyof typeof ACCENTS;

export const ACTIVE_ACCENT: AccentName = "sage";
