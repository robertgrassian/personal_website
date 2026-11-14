import type { ArtKind, ArtSource } from "../types.ts";
import {
  FABRE,
  FLORA_BATAVA,
  KOHLER,
  NORTH_AMERICAN_SYLVA,
  SEIKEI_ZUSETSU,
  THOME,
} from "./botanical.ts";
import { USDA_POMOLOGICAL } from "./usda-pomological.ts";
import { VILMORIN_ANDRIEUX } from "./vilmorin-andrieux.ts";

// Where item pictures come from, best first. An item takes the first source that has it, and
// shows its drawing (drawings.ts) when none does. To add a dataset: write one manifest beside
// these and add it here. To prefer a different picture for one item, put the source that has it
// earlier, or delete the entry from the source that should lose.
export const ART_SOURCES: readonly ArtSource[] = [
  USDA_POMOLOGICAL,
  VILMORIN_ANDRIEUX,
  KOHLER,
  THOME,
  NORTH_AMERICAN_SYLVA,
  FABRE,
  FLORA_BATAVA,
  SEIKEI_ZUSETSU,
];

export type Art = { src: string; kind: ArtKind };

// `src` is a path for next/image, which needs the leading slash that the validator's public/
// lookup does not.
export function artFor(slug: string, sources: readonly ArtSource[] = ART_SOURCES): Art | undefined {
  for (const source of sources) {
    const image = source.images[slug];
    if (image) return { src: `/${image.file}`, kind: source.kind };
  }
  return undefined;
}
