// S-rank ribbon in the top-left corner, clipped by the parent's overflow:hidden.
//
// SVG coordinate space: 96×96px (matches the cover width).
// Band between two diagonal lines:
//   Inner edge: x+y = 37  →  (0,37) to (37,0)
//   Outer edge: x+y = 55  →  (0,55) to (55,0)  (perpendicular width ≈ 13px)
// Text center at the midpoint: (23,23) on x+y = 46.

import { useId } from "react";

export function RatingRibbon() {
  // useId() gives a stable unique ID so multiple S-rank covers don't share a filter reference.
  const uid = useId();
  const filterId = `ribbon-shadow-${uid}`;

  return (
    <svg
      style={{ position: "absolute", top: 0, left: 0, zIndex: 10, pointerEvents: "none" }}
      width="100%"
      height="100%"
      viewBox="0 0 96 96"
      // xMinYMin anchors the square viewBox to the top-left; without it, SVG's default
      // xMidYMid centers it vertically inside the taller cover div, shifting the ribbon down.
      preserveAspectRatio="xMinYMin meet"
      role="img"
      aria-label="S — Perfect"
    >
      <defs>
        <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="1" dy="2" stdDeviation="2.5" floodColor="rgba(0,0,0,0.5)" />
        </filter>
      </defs>

      <polygon points="0,37 37,0 55,0 0,55" fill="#FBBF24" filter={`url(#${filterId})`} />

      {/* Outer edge shadow — grounds the far edge of the band */}
      <line x1="0" y1="55" x2="55" y2="0" stroke="rgba(0,0,0,0.2)" strokeWidth="1" />

      {/* S text — centered at (23,23) on the band midline */}
      <text
        x="23"
        y="23"
        fontSize="11"
        fontWeight="900"
        fill="#78350F"
        textAnchor="middle"
        dominantBaseline="middle"
        transform="rotate(-45, 23, 23)"
      >
        S
      </text>
    </svg>
  );
}
