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
  // Green, at OKLCH hue ~139 and deliberately LOW chroma: C 0.124 light and
  // 0.095 dark, against an sRGB ceiling near 0.165 and 0.238. That gap is the
  // point. Sage is a muted green by definition, so the restraint is the
  // identity, not a shortfall in it.
  //
  // Two retunes are already spent here, so do not repeat them:
  //   - hue 82 read as pea. That is a HUE fault, cured at ~139; dropping
  //     chroma does not cure it and costs the color its presence.
  //   - chroma raised toward the gamut edge (light #2b7815) read as a plain
  //     bright green and lost the sage.
  // If the accent needs more presence, reach for weight, underline thickness
  // or a tint at the call site. Those channels are free; this hue's chroma is
  // not, because spending it is what stops it being sage.
  //
  // Contrast: 5.19:1 on white, 9.01:1 on the dark background.
  sage: {
    light: "#417a2e",
    dark: "#8dbb81",
  },
} as const;

export type AccentName = keyof typeof ACCENTS;

export const ACTIVE_ACCENT: AccentName = "sage";
