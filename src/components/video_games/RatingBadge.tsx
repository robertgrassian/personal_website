// RatingBadge renders a small letter-grade badge in the top-right corner of a game cover.
// Used for A, B, C, and F ratings. The badge shrinks and fades as the grade gets lower,
// making S visually dominant while lower grades remain readable but unobtrusive.

type Rank = "A" | "B" | "C" | "F";

// Size, font-size, and colors for each rank.
// All backgrounds are semi-transparent so they blend with cover art.
// A is the most visually prominent; B and C share the same opacity level; F is close behind.
const BADGE_CONFIG: Record<
  Rank,
  { size: number; fontSize: number; bg: string; color: string; border: string; shadow?: string }
> = {
  A: {
    size: 17,
    fontSize: 10,
    bg: "rgba(22, 101, 52, 0.90)",
    color: "#bbf7d0",
    border: "rgba(21, 128, 61, 0.75)",
    shadow: "0 1px 4px rgba(0,0,0,0.4)",
  },
  B: {
    size: 15,
    fontSize: 9,
    bg: "rgba(30, 64, 175, 0.85)",
    color: "#bfdbfe",
    border: "rgba(37, 99, 235, 0.65)",
    shadow: "0 1px 3px rgba(0,0,0,0.35)",
  },
  C: {
    size: 13,
    fontSize: 8,
    bg: "rgba(120, 53, 15, 0.85)",
    color: "#fef3c7",
    border: "rgba(217, 119, 6, 0.65)",
    shadow: "0 1px 3px rgba(0,0,0,0.35)",
  },
  F: {
    size: 13,
    fontSize: 8,
    bg: "rgba(127, 29, 29, 0.82)",
    color: "#fecaca",
    border: "rgba(185, 28, 28, 0.65)",
    shadow: "0 1px 3px rgba(0,0,0,0.3)",
  },
};

type RatingBadgeProps = { rank: Rank };

export function RatingBadge({ rank }: RatingBadgeProps) {
  const { size, fontSize, bg, color, border, shadow } = BADGE_CONFIG[rank];

  return (
    <div
      title={rank}
      style={{
        position: "absolute",
        top: 6,
        right: 6,
        zIndex: 10,
        width: size,
        height: size,
        fontSize,
        background: bg,
        color,
        border: `1.5px solid ${border}`,
        boxShadow: shadow,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 2,
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        fontWeight: "bold",
        lineHeight: 1,
      }}
    >
      {rank}
    </div>
  );
}
