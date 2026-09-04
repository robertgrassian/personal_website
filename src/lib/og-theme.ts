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

  // ── Shelf (dark mode values for the ACTIVE shelf theme) ────────────────────
  // These follow ACTIVE_SHELF_THEME in src/lib/shelfTheme.ts, whose dark values
  // live in shelf-themes.css. They are copied rather than imported for the same
  // reason the accent hexes are: Satori has no browser, so no var() resolves.
  shelfBg: "#080706", // --shelf-bg, built-in
  // --shelf-wood as it RENDERS: in dark mode the built-in theme lays an 18%
  // black --shelf-shade over the timber, which is 0.82 of it, and Satori
  // composites no background layers.
  shelfPlank: "#58381d",
  // The lip under the plank. The OG image is a single flat shelf rather than
  // the real carcass, so these are its own values with no token behind them.
  shelfEdge: "#8b5e3c",
  shelfEdgeBottom: "#37251a",
} as const;
