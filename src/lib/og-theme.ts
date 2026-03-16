// Shared color palette for OG image generation.
//
// CSS variables (globals.css, video_games.css) are not available inside
// ImageResponse — Satori renders JSX to a PNG with no browser, so there is
// no cascade or var() resolution. This file mirrors the relevant site tokens
// so OG images stay visually coherent with the live site without duplicating
// magic strings across multiple opengraph-image.tsx files.
//
// When updating a color in globals.css or video_games.css, update it here too.

export const OG = {
  // ── Text ───────────────────────────────────────────────────────────────────
  textPrimary: "#ededed", // --foreground (dark)
  textMuted: "#9ca3af", // --muted (dark)

  // ── Accent ─────────────────────────────────────────────────────────────────
  // Mirrors --link in light mode (#b45309, amber-700).
  // This is the same color used by the BackToHome component (text-link).
  // Intentionally the muted amber-700 tone — not the brighter amber-500 (#f59e0b)
  // used in dark mode, which reads as too saturated/yellow in a static image context.
  accent: "#b45309",

  // ── Page background ────────────────────────────────────────────────────────
  pageDark: "#0a0a0a", // --background (dark)

  // ── Shelf (dark mode values from video_games.css .shelf-theme) ─────────────
  shelfBg: "#0f0d0b", // --shelf-bg
  shelfPlank: "#2a1a0e", // --shelf-plank
  shelfEdge: "#8b5e3c", // --shelf-edge
  shelfEdgeBottom: "#37251a", // --shelf-edge-bottom
} as const;
