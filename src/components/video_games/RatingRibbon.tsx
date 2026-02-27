// RatingRibbon renders the S-rank ribbon in the top-left corner of a game cover.
// Uses an inline SVG clipped by the parent's overflow:hidden + border-radius.
//
// SVG coordinate space: 96×96px (matches the cover width).
//
// The band sits between two parallel diagonal lines:
//   Inner edge (near corner): x+y = 37  →  (0,37) to (37,0)
//   Outer edge (away from corner): x+y = 55  →  (0,55) to (55,0)
// Perpendicular width: (55−37)/√2 ≈ 13px
//
// Text center lies on x+y = 46 (midpoint), at diagonal center (23,23).

import { useId } from "react";

export function RatingRibbon() {
  // useId() ensures the filter ID is unique when multiple S-rank games are on screen.
  const uid = useId();
  const filterId = `ribbon-shadow-${uid}`;

  return (
    <svg
      style={{ position: "absolute", top: 0, left: 0, zIndex: 10, pointerEvents: "none" }}
      width="100%"
      height="100%"
      viewBox="0 0 96 96"
      aria-label="S — Perfect"
      overflow="visible"
    >
      <defs>
        <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="1" dy="2" stdDeviation="2.5" floodColor="rgba(0,0,0,0.5)" />
        </filter>
      </defs>

      {/* Main ribbon band */}
      <polygon points="0,37 37,0 55,0 0,55" fill="#FBBF24" filter={`url(#${filterId})`} />

      {/* Outer edge shadow — dark line to ground the far edge of the band */}
      <line x1="0" y1="55" x2="55" y2="0" stroke="rgba(0,0,0,0.2)" strokeWidth="1" />

      {/* S text — centered at (23,23) on the band midline x+y=46 */}
      <text
        x="23"
        y="23"
        fontFamily="'Helvetica Neue', Arial, sans-serif"
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
