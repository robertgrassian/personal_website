// Letter-grade badge for A, B, C, and F ratings.

import type { BadgeRank } from "@/lib/games";

// rgba colors can't be expressed as static Tailwind classes, so they stay in inline style.
// All sizing and layout uses Tailwind (w-4 h-4 text-[10px] etc.).
const BADGE_CONFIG: Record<
  BadgeRank,
  { bg: string; color: string; border: string; label: string; shadow?: string }
> = {
  A: {
    bg: "rgba(22, 101, 52, 0.90)",
    color: "#bbf7d0",
    border: "rgba(21, 128, 61, 0.75)",
    label: "Great",
    shadow: "0 1px 4px rgba(0,0,0,0.4)",
  },
  B: {
    bg: "rgba(30, 64, 175, 0.85)",
    color: "#bfdbfe",
    border: "rgba(37, 99, 235, 0.65)",
    label: "Good",
    shadow: "0 1px 3px rgba(0,0,0,0.35)",
  },
  C: {
    bg: "rgba(120, 53, 15, 0.85)",
    color: "#fef3c7",
    border: "rgba(217, 119, 6, 0.65)",
    label: "Okay",
    shadow: "0 1px 3px rgba(0,0,0,0.35)",
  },
  F: {
    bg: "rgba(127, 29, 29, 0.82)",
    color: "#fecaca",
    border: "rgba(185, 28, 28, 0.65)",
    label: "Bad",
    shadow: "0 1px 3px rgba(0,0,0,0.3)",
  },
};

type RatingBadgeProps = { rank: BadgeRank };

export function RatingBadge({ rank }: RatingBadgeProps) {
  const { bg, color, border, label, shadow } = BADGE_CONFIG[rank];

  return (
    <div
      role="img"
      aria-label={`${rank} — ${label}`}
      className="absolute top-1.5 right-1.5 z-10 w-4 h-4 text-[10px] flex items-center justify-center rounded-sm font-bold leading-none select-none cursor-default"
      style={{
        background: bg,
        color,
        border: `1.5px solid ${border}`,
        boxShadow: shadow,
      }}
    >
      {rank}
    </div>
  );
}
