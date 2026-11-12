import { produceBySlug } from "./catalog.ts";
import type { Produce, ProduceCategory, Region } from "./types.ts";

// What the browse page ships to the client: a catalog entry joined with its season in one region.
// Plain data, so it crosses the Server → Client Component boundary as a prop.
export type ProduceItem = Produce & {
  season: string;
  // Which of the hand-drawn borders this card wears.
  variant: number;
};

export const CATEGORY_ORDER: readonly ProduceCategory[] = [
  "fruit",
  "vegetable",
  "herb",
  "mushroom",
];

export const CATEGORY_LABELS: Readonly<Record<ProduceCategory, string>> = {
  fruit: "Fruit",
  vegetable: "Vegetables",
  herb: "Herbs",
  mushroom: "Mushrooms",
};

// FNV-1a: stable across runtimes and releases, so a card keeps its border between deploys.
export function slugHash(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function regionItems(region: Region, variants: number): ProduceItem[] {
  return Object.entries(region.seasons)
    .flatMap(([slug, season]) => {
      const produce = produceBySlug(slug);
      // The validator makes this unreachable; skipping beats crashing a page over it.
      if (!produce) return [];
      return [{ ...produce, season, variant: slugHash(slug) % variants }];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Only the categories the region grows get a chip.
export function categoriesIn(items: readonly ProduceItem[]): ProduceCategory[] {
  const present = new Set(items.map((i) => i.category));
  return CATEGORY_ORDER.filter((c) => present.has(c));
}
