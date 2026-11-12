import type { ProduceCategory } from "./types.ts";

// Its own module, importing only a type, because Client Components need these labels: taking them
// from browse.ts pulled the whole catalog into the browser bundle behind them.
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
