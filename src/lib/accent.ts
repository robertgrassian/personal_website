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
  // Green, at OKLCH hue ~139 and deliberately low chroma: C 0.124 light and
  // 0.095 dark, against an sRGB ceiling near 0.165 and 0.238 at those
  // lightnesses. The unspent headroom is the point, because a muted green is
  // what sage IS.
  //
  // Two retunes are spent here, so do not repeat either. Yellower hues read as
  // pea, which is a hue fault and is fixed by staying near 139: lowering chroma
  // does not fix it and costs the color its presence. Raising chroma toward the
  // ceiling (light #2b7815) reads as a plain bright green and loses the sage.
  // If the accent needs more presence, it has to come from a call site, not
  // from here.
  //
  // Contrast: 5.19:1 on white, 9.01:1 on the dark background.
  sage: {
    light: "#417a2e",
    dark: "#8dbb81",
  },
} as const;

export type AccentName = keyof typeof ACCENTS;

export const ACTIVE_ACCENT: AccentName = "sage";
