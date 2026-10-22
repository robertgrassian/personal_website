// Shared color palette for OG image generation.
//
// CSS variables (globals.css, video-games.css) are not available inside
// ImageResponse — Satori renders JSX to a PNG with no browser, so there is
// no cascade or var() resolution. This file mirrors the relevant site tokens
// so OG images stay visually coherent with the live site without duplicating
// magic strings across multiple opengraph-image.tsx files.
//
// When updating a color in globals.css or video-games.css, update it here too.

import { ACCENTS, ACTIVE_ACCENT } from "./accent";

// Satori has no color-mix(), so an accent at partial alpha has to be built
// here rather than in the JSX.
function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const OG = {
  // ── Text ───────────────────────────────────────────────────────────────────
  textPrimary: "#ededed", // --foreground (dark)
  textMuted: "#9ca3af", // --muted (dark)

  // ── Accent ─────────────────────────────────────────────────────────────────
  // The DARK value, because the OG canvas is pageDark below, and this is the
  // value that scheme's accent was picked against: on #0a0a0a the light value
  // measures 3.3-3.7:1 and the dark one 8.8-10:1.
  //
  // This used to hold the light value on purpose, to avoid amber-500 reading
  // as too saturated in a static image. That objection was to amber
  // specifically; both current accents are muted, so the value actually
  // designed for a dark ground is now the right one.
  accent: ACCENTS[ACTIVE_ACCENT].dark,

  // The same accent as a background glow, for the gradient variant.
  accentGlow: rgba(ACCENTS[ACTIVE_ACCENT].dark, 0.55),

  // ── Page background ────────────────────────────────────────────────────────
  pageDark: "#0a0a0a", // --background (dark)

  // ── Shelf (dark mode values for the built-in theme) ────────────────────────
  // The library OG image draws the built-in bookcase whatever ACTIVE_SHELF_THEME
  // says. These are copied from shelf-themes.css rather than imported for the
  // same reason the accent hexes are: Satori has no browser, so no var() resolves.
  shelfBg: "#080706", // --shelf-bg, built-in
  shelfWood: "#5c3d24", // --shelf-wood
  shelfWoodLit: "#6a472a", // --shelf-wood-lit
  shelfCarcass: "#3d2716", // --shelf-carcass
  // --shelf-shade (dark): the 18% black laid over every wooden piece.
  shelfShade: "linear-gradient(rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.18))",
} as const;
