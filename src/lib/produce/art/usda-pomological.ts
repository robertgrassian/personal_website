import type { ArtSource } from "../types.ts";

const FILE = "https://commons.wikimedia.org/wiki/File:Pomological_Watercolor_";

// Cropped to the specimen from full plates, which carry a cut section and the collector's
// handwriting. Fruit only: the collection has no vegetables, herbs or mushrooms, and a search for
// "pumpkin" returns the Pumpkin Sweet apple, so check what a plate depicts before adding one.
export const USDA_POMOLOGICAL: ArtSource = {
  id: "usda-pomological",
  credit: {
    name: "USDA Pomological Watercolor Collection",
    url: "https://commons.wikimedia.org/wiki/Category:USDA_Pomological_Watercolor_Collection",
  },
  license: "Public domain",
  images: {
    // Buckskin
    apple: {
      file: "produce/art/usda-pomological/apple.jpg",
      sourceUrl: `${FILE}POM00001721.jpg`,
    },
    // Coles Winter
    pear: {
      file: "produce/art/usda-pomological/pear.jpg",
      sourceUrl: `${FILE}POM00006795.jpg`,
    },
    // Howes
    cranberry: {
      file: "produce/art/usda-pomological/cranberry.jpg",
      sourceUrl: `${FILE}POM00007173.jpg`,
    },
  },
};
