import { GLYPH_VIEWBOX } from "@/lib/produce/sketchBoxes";

// A rough.js path stretched over its positioned parent. The path is drawn once on the server in a
// fixed viewBox; preserveAspectRatio="none" lets it follow any box, and the CSS gives the stroke
// vector-effect: non-scaling-stroke so stretching does not thicken or thin the line.
// No "use client": it has no state, so it renders on either side of the boundary.
export function RoughFrame({
  d,
  viewBox,
  className = "",
}: {
  d: string;
  viewBox: string;
  className?: string;
}) {
  return (
    <svg
      className={`produce-rough ${className}`}
      viewBox={viewBox}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

// A glyph keeps its aspect ratio, unlike a frame.
export function RoughGlyph({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg
      className={`produce-glyph ${className}`}
      viewBox={GLYPH_VIEWBOX}
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
