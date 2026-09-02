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

  // ── Page background ────────────────────────────────────────────────────────
  pageDark: "#0a0a0a", // --background (dark)

  // ── Shelf (dark mode values from video-games.css .shelf-theme) ─────────────
  shelfBg: "#0f0d0b", // --shelf-bg
  shelfPlank: "#2a1a0e", // --shelf-plank
  shelfEdge: "#8b5e3c", // --shelf-edge
  shelfEdgeBottom: "#37251a", // --shelf-edge-bottom
} as const;
