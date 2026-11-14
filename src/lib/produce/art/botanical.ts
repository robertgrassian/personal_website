import { commonsSource } from "./commons.ts";

// Small sources that each fill a few items the two big ones lack. All are colour plates cropped to
// the plant; the ones printed on white are tinted to cream so they have paper of their own, like
// the USDA plates. Robert picked these per item from a side-by-side on 2026-11-14.

// Whole-sprig botanical plates with dissected flowers around the edge, which the crop drops.
export const KOHLER = commonsSource({
  id: "kohler",
  name: "Köhler's Medizinal-Pflanzen",
  category: "Köhlers Medizinal-Pflanzen",
  license: "Public domain",
  kind: "plate",
  files: {
    cilantro: "Coriandrum sativum - Köhler–s Medizinal-Pflanzen-193.jpg",
    // Peppermint.
    mint: "Mentha × piperita - Köhler–s Medizinal-Pflanzen-095.jpg",
    quince: "Cydonia oblonga - Köhler–s Medizinal-Pflanzen-049.jpg",
    "sour-cherry": "Prunus cerasus - Köhler–s Medizinal-Pflanzen-113.jpg",
  },
});

export const THOME = commonsSource({
  id: "thome",
  name: "Thomé's Flora von Deutschland",
  category: "Thomé, Flora von Deutschland (modified)",
  license: "Public domain",
  kind: "plate",
  files: { dill: "Illustration Anethum graveolens clean.jpg" },
});

export const NORTH_AMERICAN_SYLVA = commonsSource({
  id: "north-american-sylva",
  name: "Michaux's North American Sylva",
  category: "North American Sylva",
  license: "Public domain",
  kind: "plate",
  files: { olive: "NAS-087 Olea europaea.png" },
});

export const FABRE = commonsSource({
  id: "fabre",
  name: "Jean-Henri Fabre",
  category: "Watercolor paintings by Jean-Henri Fabre",
  license: "Public domain",
  kind: "plate",
  files: { chanterelle: "45 Cantharellus cibarius Jean-Henri FABRE.jpg" },
});

// Robert's pick for the morel was Bresadola's, but that plate is dated 1932 and so is probably
// still under copyright in the United States. This one stands in until that is settled.
export const FLORA_BATAVA = commonsSource({
  id: "flora-batava",
  name: "Flora Batava",
  category: "Flora Batava (mushrooms, mosses and seaweeds)",
  license: "Public domain",
  kind: "plate",
  files: {
    maitake: "Polyporus frondosus — Flora Batava — Volume v16.jpg",
    morel: "Morchella esculenta — Flora Batava — Volume v9.jpg",
    "oyster-mushroom": "Agaricus ostreatus — Flora Batava — Volume v10.jpg",
  },
});

// An 1804 Japanese encyclopedia, scanned by Leiden University Libraries. Not public domain: the
// scans are CC BY, which the credit line satisfies by naming the source and the licence. The ramp
// is an Asian relative (Allium ochotense), the fiddlehead is bracken, and the napa cabbage is a
// loose-leaved Brassica rapa.
export const SEIKEI_ZUSETSU = commonsSource({
  id: "seikei-zusetsu",
  name: "Seikei Zusetsu, Leiden University Libraries",
  category: "Seikei Zusetsu",
  license: "CC BY 4.0",
  kind: "plate",
  files: {
    fiddleheads:
      "Leiden University Library - Seikei Zusetsu vol. 30, page 010 - 蕨 - Pteridium aquilinum, 1804.jpg",
    "napa-cabbage":
      "Leiden University Library - Seikei Zusetsu vol. 21, page 015 - 白莖菜 - Brassica rapa L. - 水菜 - idem, 1804.jpg",
    ramps:
      "Leiden University Library - Seikei Zusetsu vol. 24, page 026 - 茖蒜 - Allium ochotense Prokh., 1804.jpg",
  },
});
