import { DRAWINGS, SHAPES } from "@/lib/produce/drawings";

// The drawn fallback for an item with no real picture: the colour fill twice (once offset and
// faint, so the wash overruns the outline), then the outline in --p-ink so it follows the scheme.
// No "use client": it has no state, so it renders on either side of the boundary.
export function Drawing({ slug }: { slug: string }) {
  const drawn = DRAWINGS[slug];
  if (!drawn) return null;
  const shape = SHAPES[drawn.shape];
  const accent = drawn.accent ?? drawn.body;
  return (
    <svg className="produce-drawing" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g fill={drawn.body} opacity={0.35} transform="translate(1.8 1.6)">
        {shape.body.map((path, i) => (
          <path key={i} d={path} />
        ))}
      </g>
      <g className="produce-drawing-body" fill={drawn.body}>
        {shape.body.map((path, i) => (
          <path key={i} d={path} />
        ))}
      </g>
      <g className="produce-drawing-body" fill={accent}>
        {shape.accent.map((path, i) => (
          <path key={i} d={path} />
        ))}
      </g>
      <g className="produce-drawing-ink">
        {[...shape.body, ...shape.accent, ...shape.line].map((path, i) => (
          <path key={i} d={path} />
        ))}
      </g>
    </svg>
  );
}
