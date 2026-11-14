import type { ArtSource } from "../types.ts";
import { USDA_POMOLOGICAL } from "./usda-pomological.ts";

// Where item pictures come from, best first. An item takes the first source that has it, and
// shows the seed-packet glyph when none does. To add a dataset: write one manifest beside
// usda-pomological.ts and add it here. To prefer a different picture for one item, put the source
// that has it earlier.
export const ART_SOURCES: readonly ArtSource[] = [USDA_POMOLOGICAL];

// A path for next/image, which needs the leading slash that the validator's public/ lookup does
// not.
export function artFor(
  slug: string,
  sources: readonly ArtSource[] = ART_SOURCES
): string | undefined {
  for (const source of sources) {
    const image = source.images[slug];
    if (image) return `/${image.file}`;
  }
  return undefined;
}
