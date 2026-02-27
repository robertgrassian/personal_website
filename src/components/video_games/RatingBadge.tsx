// Letter-grade badge for A, B, C, and F ratings. Shrinks with rank so S stays visually dominant.

import type { BadgeRank } from "@/lib/games";
import { RATING_FONT } from "@/lib/games";

// Per-rank pixel sizes and rgba colors can't be expressed as static Tailwind classes,
// so they stay in inline style. Layout (position, flex, border-radius, etc.) uses Tailwind.
const BADGE_CONFIG: Record<
  BadgeRank,
  {
    size: number;
    fontSize: number;
    bg: string;
    color: string;
    border: string;
    label: string;
    shadow?: string;
  }
> = {
  A: {
    size: 17,
    fontSize: 10,
    bg: "rgba(22, 101, 52, 0.90)",
    color: "#bbf7d0",
    border: "rgba(21, 128, 61, 0.75)",
    label: "Great",
    shadow: "0 1px 4px rgba(0,0,0,0.4)",
  },
  B: {
    size: 15,
    fontSize: 9,
    bg: "rgba(30, 64, 175, 0.85)",
    color: "#bfdbfe",
    border: "rgba(37, 99, 235, 0.65)",
    label: "Good",
    shadow: "0 1px 3px rgba(0,0,0,0.35)",
  },
  C: {
    size: 13,
    fontSize: 8,
    bg: "rgba(120, 53, 15, 0.85)",
    color: "#fef3c7",
    border: "rgba(217, 119, 6, 0.65)",
    label: "Okay",
    shadow: "0 1px 3px rgba(0,0,0,0.35)",
  },
  F: {
    size: 13,
    fontSize: 8,
    bg: "rgba(127, 29, 29, 0.82)",
    color: "#fecaca",
    border: "rgba(185, 28, 28, 0.65)",
    label: "Bad",
    shadow: "0 1px 3px rgba(0,0,0,0.3)",
  },
};

type RatingBadgeProps = { rank: BadgeRank };

export function RatingBadge({ rank }: RatingBadgeProps) {
  const { size, fontSize, bg, color, border, label, shadow } = BADGE_CONFIG[rank];

  return (
    <div
      role="img"
      aria-label={`${rank} — ${label}`}
      title={`${rank} — ${label}`}
      className="absolute top-1.5 right-1.5 z-10 flex items-center justify-center rounded-sm font-bold leading-none"
      style={{
        width: size,
        height: size,
        fontSize,
        background: bg,
        color,
        border: `1.5px solid ${border}`,
        boxShadow: shadow,
        fontFamily: RATING_FONT,
      }}
    >
      {rank}
    </div>
  );
}
