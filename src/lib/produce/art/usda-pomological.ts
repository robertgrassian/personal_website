import type { ArtSource } from "../types.ts";

const FILE = "https://commons.wikimedia.org/wiki/File:Pomological_Watercolor_";

// Cropped to the specimen from full plates, which carry a cut section and the collector's
// handwriting. Fruit only: the collection has no vegetables, herbs or mushrooms, and a search by
// name finds apple varieties called Olive, Raspberry and Watermelon, so read what a plate depicts
// (its "variety of X" phrase), not whether the name appears in it.
//
// Not used, on purpose, so the drawn fallback shows instead: apricot (the only plate is a Japanese
// apricot), blood orange and quince (pencil or pen fragments), cantaloupe and honeydew (halved
// melons, seeds showing), fig and kiwifruit (a bare branch and a twig), lime (an orange-yellow
// fruit), mandarin (a blemished satsuma), olive (a cross-section), sour cherry (the plate is
// labelled as a sweet cherry), currant (none found).
export const USDA_POMOLOGICAL: ArtSource = {
  id: "usda-pomological",
  credit: {
    name: "USDA Pomological Watercolor Collection",
    url: "https://commons.wikimedia.org/wiki/Category:USDA_Pomological_Watercolor_Collection",
  },
  license: "Public domain",
  images: {
    // Buckskin
    apple: { file: "produce/art/usda-pomological/apple.jpg", sourceUrl: `${FILE}POM00001721.jpg` },
    // Akarian
    "asian-pear": {
      file: "produce/art/usda-pomological/asian-pear.jpg",
      sourceUrl: `${FILE}POM00007134.jpg`,
    },
    // Baldwin
    avocado: {
      file: "produce/art/usda-pomological/avocado.jpg",
      sourceUrl: `${FILE}POM00004532.jpg`,
    },
    // Joy
    blackberry: {
      file: "produce/art/usda-pomological/blackberry.jpg",
      sourceUrl: `${FILE}POM00007218.jpg`,
    },
    // No. 837
    blueberry: {
      file: "produce/art/usda-pomological/blueberry.jpg",
      sourceUrl: `${FILE}POM00006845.jpg`,
    },
    cherimoya: {
      file: "produce/art/usda-pomological/cherimoya.jpg",
      sourceUrl: `${FILE}POM00007375.jpg`,
    },
    // Ostheim
    cherry: {
      file: "produce/art/usda-pomological/cherry.jpg",
      sourceUrl: `${FILE}POM00004188.jpg`,
    },
    // Concord
    "concord-grape": {
      file: "produce/art/usda-pomological/concord-grape.jpg",
      sourceUrl: `${FILE}POM00000867.jpg`,
    },
    // Howes
    cranberry: {
      file: "produce/art/usda-pomological/cranberry.jpg",
      sourceUrl: `${FILE}POM00007173.jpg`,
    },
    // Tafilalt
    date: { file: "produce/art/usda-pomological/date.jpg", sourceUrl: `${FILE}POM00007408.jpg` },
    feijoa: {
      file: "produce/art/usda-pomological/feijoa.jpg",
      sourceUrl: `${FILE}POM00007435.jpg`,
    },
    gooseberry: {
      file: "produce/art/usda-pomological/gooseberry.jpg",
      sourceUrl: `${FILE}POM00007146.jpg`,
    },
    // Rose d'Italie
    grape: { file: "produce/art/usda-pomological/grape.jpg", sourceUrl: `${FILE}POM00006074.jpg` },
    // Silver Cluster Seedless
    grapefruit: {
      file: "produce/art/usda-pomological/grapefruit.jpg",
      sourceUrl: `${FILE}POM00000297.jpg`,
    },
    // Sour
    kumquat: {
      file: "produce/art/usda-pomological/kumquat.jpg",
      sourceUrl: `${FILE}POM00007464.jpg`,
    },
    // Perrine
    lemon: { file: "produce/art/usda-pomological/lemon.jpg", sourceUrl: `${FILE}POM00000089.jpg` },
    // Meyer
    "meyer-lemon": {
      file: "produce/art/usda-pomological/meyer-lemon.jpg",
      sourceUrl: `${FILE}POM00000129.jpg`,
    },
    // Washington Navel
    "navel-orange": {
      file: "produce/art/usda-pomological/navel-orange.jpg",
      sourceUrl: `${FILE}POM00000340.jpg`,
    },
    // Quetta
    nectarine: {
      file: "produce/art/usda-pomological/nectarine.jpg",
      sourceUrl: `${FILE}POM00005704.jpg`,
    },
    pawpaw: {
      file: "produce/art/usda-pomological/pawpaw.jpg",
      sourceUrl: `${FILE}POM00000862.jpg`,
    },
    // 'Babcock'
    peach: { file: "produce/art/usda-pomological/peach.jpg", sourceUrl: `${FILE}POM00005067.jpg` },
    // Coles Winter
    pear: { file: "produce/art/usda-pomological/pear.jpg", sourceUrl: `${FILE}POM00006795.jpg` },
    // Tane Nashi (Shibu)
    persimmon: {
      file: "produce/art/usda-pomological/persimmon.jpg",
      sourceUrl: `${FILE}POM00001142.jpg`,
    },
    // Dorsett
    plum: { file: "produce/art/usda-pomological/plum.jpg", sourceUrl: `${FILE}POM00004789.jpg` },
    // Wonderful
    pomegranate: {
      file: "produce/art/usda-pomological/pomegranate.jpg",
      sourceUrl: `${FILE}POM00007463.jpg`,
    },
    // Chinese Shaddock
    pomelo: {
      file: "produce/art/usda-pomological/pomelo.jpg",
      sourceUrl: `${FILE}POM00006365.jpg`,
    },
    // Eaton
    raspberry: {
      file: "produce/art/usda-pomological/raspberry.jpg",
      sourceUrl: `${FILE}POM00000866.jpg`,
    },
    // Riehls Perfection
    strawberry: {
      file: "produce/art/usda-pomological/strawberry.jpg",
      sourceUrl: `${FILE}POM00003953.jpg`,
    },
    // Valencia
    "valencia-orange": {
      file: "produce/art/usda-pomological/valencia-orange.jpg",
      sourceUrl: `${FILE}POM00000263.jpg`,
    },
    // Tom Watson
    watermelon: {
      file: "produce/art/usda-pomological/watermelon.jpg",
      sourceUrl: `${FILE}POM00007419.jpg`,
    },
  },
};
