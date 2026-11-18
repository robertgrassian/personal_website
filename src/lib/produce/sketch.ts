// Hand-drawn chrome for the produce page, as SVG path data. Importing "server-only" fails the build
// if a Client Component ever imports this, which is what keeps rough.js out of the browser bundle:
// the strings are computed here and reach the client as props.
import "server-only";
import rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import type { SeasonId } from "./season";
import type { ProduceCategory } from "./types";

// The generator draws no DOM, just geometry. Every shape gets a fixed seed: unseeded, rough.js is
// random per call, so the server HTML and a later render would disagree.
const gen = rough.generator();

const BASE: Options = { roughness: 1.4, bowing: 1.2, fixedDecimalPlaceDigits: 1 };

function pathOf(drawable: ReturnType<typeof gen.rectangle>): string {
  return gen
    .toPaths(drawable)
    .map((p) => p.d)
    .join(" ");
}

// Each shape below is drawn in its box from sketchBoxes.ts. Card borders are stretched over
// whatever size the card is; preserveAspectRatio="none" plus a non-scaling stroke keeps the line
// weight. Six seeds, so neighbouring cards rarely match and the page ships six paths, not a hundred.
const BORDER_SEEDS = [11, 23, 37, 41, 59, 73];

export function cardBorders(): string[] {
  return BORDER_SEEDS.map((seed) => pathOf(gen.rectangle(3, 3, 94, 94, { ...BASE, seed })));
}

// The same rough rectangle at a real pixel size, for the OG image, which Satori draws without CSS.
export function roughRect(width: number, height: number, seed: number): string {
  return pathOf(gen.rectangle(4, 4, width - 8, height - 8, { ...BASE, roughness: 1.6, seed }));
}

// The loop around the selected month.
export function monthCircle(): string {
  return pathOf(gen.ellipse(50, 30, 90, 50, { ...BASE, roughness: 1.1, seed: 5 }));
}

export function underline(): string {
  return pathOf(gen.line(4, 6, 196, 4, { ...BASE, roughness: 1.6, bowing: 3, seed: 8 }));
}

// Category glyphs for the share image: a round fruit with a leaf, a carrot, a sprig, a mushroom.
export function categoryGlyphs(): Record<ProduceCategory, string> {
  const g = { ...BASE, roughness: 0.9, bowing: 0.8 };
  return {
    fruit: [
      pathOf(gen.circle(12, 14, 15, { ...g, seed: 1 })),
      pathOf(gen.line(12, 7, 13, 3, { ...g, seed: 2 })),
      pathOf(
        gen.curve(
          [
            [13, 5],
            [17, 2],
            [19, 5],
            [14, 6],
          ],
          { ...g, seed: 3 }
        )
      ),
    ].join(" "),
    vegetable: [
      pathOf(
        gen.polygon(
          [
            [8, 8],
            [16, 8],
            [12.5, 22],
          ],
          { ...g, seed: 4 }
        )
      ),
      pathOf(gen.line(10, 8, 7, 2, { ...g, seed: 5 })),
      pathOf(gen.line(12, 8, 12, 2, { ...g, seed: 6 })),
      pathOf(gen.line(14, 8, 17, 2, { ...g, seed: 7 })),
    ].join(" "),
    herb: [
      pathOf(gen.line(12, 22, 12, 4, { ...g, seed: 8 })),
      pathOf(gen.ellipse(8, 10, 7, 4, { ...g, seed: 9 })),
      pathOf(gen.ellipse(16, 13, 7, 4, { ...g, seed: 10 })),
      pathOf(gen.ellipse(8, 17, 7, 4, { ...g, seed: 11 })),
    ].join(" "),
    mushroom: [
      pathOf(gen.arc(12, 12, 18, 14, Math.PI, Math.PI * 2, true, { ...g, seed: 12 })),
      pathOf(gen.rectangle(10, 12, 4, 9, { ...g, seed: 13 })),
    ].join(" "),
  };
}

// One icon per season, in the same 24 box as the category glyphs: a blossom, a sun, a leaf and a
// snowflake.
export function seasonGlyphs(): Record<SeasonId, string> {
  const g = { ...BASE, roughness: 0.9, bowing: 0.8 };
  // Five petals round a centre, then the stem.
  const petals = [0, 1, 2, 3, 4].map((i) => {
    const angle = ((-90 + i * 72) * Math.PI) / 180;
    return pathOf(
      gen.circle(12 + 4.2 * Math.cos(angle), 9 + 4.2 * Math.sin(angle), 6, { ...g, seed: 20 + i })
    );
  });
  // Eight rays round the disc, at 45 degrees apart.
  const rays = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const angle = (i * 45 * Math.PI) / 180;
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    return pathOf(
      gen.line(12 + 7 * c, 12 + 7 * s, 12 + 10.5 * c, 12 + 10.5 * s, { ...g, seed: 40 + i })
    );
  });
  // Three lines through the centre make six arms.
  const arms = [90, 30, -30].map((deg, i) => {
    const angle = (deg * Math.PI) / 180;
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    return pathOf(
      gen.line(12 - 10.5 * c, 12 - 10.5 * s, 12 + 10.5 * c, 12 + 10.5 * s, { ...g, seed: 60 + i })
    );
  });
  return {
    spring: [
      ...petals,
      pathOf(gen.circle(12, 9, 3.5, { ...g, seed: 25 })),
      pathOf(gen.line(12, 15, 12, 23, { ...g, seed: 26 })),
    ].join(" "),
    summer: [pathOf(gen.circle(12, 12, 9, { ...g, seed: 30 })), ...rays].join(" "),
    fall: [
      pathOf(
        gen.curve(
          [
            [3, 21],
            [4, 11],
            [11, 4],
            [21, 3],
            [20, 13],
            [13, 20],
            [3, 21],
          ],
          { ...g, seed: 50 }
        )
      ),
      pathOf(gen.line(3, 21, 15, 9, { ...g, seed: 51 })),
    ].join(" "),
    winter: arms.join(" "),
  };
}

export type ProduceSketch = {
  borders: string[];
  circle: string;
  underline: string;
  seasons: Record<SeasonId, string>;
};

// Computed once per server process: the seeds are fixed, so the output never changes.
let cached: ProduceSketch | null = null;
export function produceSketch(): ProduceSketch {
  cached ??= {
    borders: cardBorders(),
    circle: monthCircle(),
    underline: underline(),
    seasons: seasonGlyphs(),
  };
  return cached;
}
