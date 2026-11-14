// The drawn fallback for an item with no real picture: a hand-inked, watercolor-washed shape in
// the item's own colours. About two dozen shapes cover the catalog (every leafy green is the same
// leaf in a different green), so an item is a shape plus a colour, not a drawing of its own.
// Paths are in a 64 box. They are plain data, so they render the same on server and client.

export type Shape = {
  // Filled with the item's colour, then outlined.
  body: readonly string[];
  // Filled with the item's second colour (leaf, stem, husk), then outlined.
  accent: readonly string[];
  // Ink only: ribs, seeds, highlights.
  line: readonly string[];
};

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

export const SHAPES = {
  round: {
    body: ["M32 20C22 14 8 20 10 38C12 54 24 60 32 56C40 60 52 54 54 38C56 20 42 14 32 20Z"],
    accent: ["M35 14C40 6 50 8 52 12C46 16 40 16 35 14Z"],
    line: ["M32 20C32 14 34 10 36 8", "M16 30C16 26 19 24 22 24", "M44 32L48 40M40 38L46 48"],
  },
  pear: {
    body: [
      "M32 14C38 14 38 22 40 28C42 34 50 38 50 48C50 58 40 60 32 60C24 60 14 58 14 48C14 38 22 34 24 28C26 22 26 14 32 14Z",
    ],
    accent: ["M33 10C38 4 46 6 48 9C42 13 37 13 33 10Z"],
    line: ["M32 14C32 10 34 6 36 5", "M20 44C20 48 22 52 26 54", "M42 40L45 46M38 46L42 54"],
  },
  berries: {
    body: [circle(20, 40, 11), circle(43, 42, 12), circle(31, 22, 10)],
    accent: ["M31 12C36 6 44 8 46 11C40 15 35 15 31 12Z"],
    line: [
      "M16 36C16 33 18 31 21 31M38 38C38 35 40 33 43 33M27 18C27 16 29 14 31 14",
      "M31 12L31 9",
    ],
  },
  cherries: {
    body: [circle(20, 44, 10), circle(44, 46, 10)],
    accent: ["M32 8C38 4 46 6 48 10C42 14 36 12 32 8Z"],
    line: [
      "M20 34C22 24 28 14 32 8M44 36C42 24 36 14 32 8",
      "M15 41C15 38 17 36 20 36M39 43C39 40 41 38 44 38",
    ],
  },
  citrus: {
    body: [circle(32, 37, 22)],
    accent: ["M32 15C34 7 44 5 48 9C44 15 38 17 32 15Z"],
    line: ["M16 30C17 25 20 22 24 20", "M30 16h4", "M42 48L46 44M36 52L42 50M24 50L20 46"],
  },
  melon: {
    body: ["M8 36C8 20 20 14 32 14C44 14 56 20 56 36C56 50 44 58 32 58C20 58 8 50 8 36Z"],
    accent: ["M29 14L29 8L35 8L35 14Z"],
    line: [
      "M32 14C24 24 24 48 32 58M32 14C40 24 40 48 32 58M20 16C12 26 14 46 20 55M44 16C52 26 50 46 44 55",
      "M10 30C24 34 40 34 54 30M10 42C24 46 40 46 54 42",
    ],
  },
  grapes: {
    body: [
      circle(20, 28, 7.5),
      circle(34, 26, 7.5),
      circle(48, 28, 7.5),
      circle(27, 40, 7.5),
      circle(41, 40, 7.5),
      circle(34, 52, 7.5),
    ],
    accent: ["M34 20C30 10 40 4 50 6C52 14 44 20 34 20Z"],
    line: [
      "M34 20L34 12",
      "M16 25C16 23 18 22 20 22M30 23C30 21 32 20 34 20M23 37C23 35 25 34 27 34",
    ],
  },
  strawberry: {
    body: ["M32 58C18 50 10 38 12 26C14 20 22 18 32 22C42 18 50 20 52 26C54 38 46 50 32 58Z"],
    accent: [
      "M32 22C26 16 20 14 18 18C22 22 28 24 32 22Z",
      "M32 22C38 16 44 14 46 18C42 22 36 24 32 22Z",
      "M32 22C32 14 32 10 32 8C34 12 34 18 32 22Z",
    ],
    line: ["M22 32l1 2M30 30l1 2M40 32l1 2M26 42l1 2M36 40l1 2M32 50l1 2M44 40l1 2M18 38l1 2"],
  },
  tomato: {
    body: ["M32 18C16 16 6 26 8 40C10 54 22 58 32 58C42 58 54 54 56 40C58 26 48 16 32 18Z"],
    accent: ["M32 18L24 14L28 20L20 22L28 24L26 30L32 26L38 30L36 24L44 22L36 20L40 14Z"],
    line: ["M32 18C32 14 33 11 35 9", "M14 34C14 30 17 27 20 26"],
  },
  pumpkin: {
    body: ["M32 18C14 14 6 30 8 42C10 54 22 58 32 56C42 58 54 54 56 42C58 30 50 14 32 18Z"],
    accent: ["M30 18C30 12 32 8 36 6L40 8C37 10 36 14 36 18Z"],
    line: [
      "M32 18C24 26 24 48 32 56M32 18C40 26 40 48 32 56M20 20C12 30 14 48 22 55M44 20C52 30 50 48 42 55",
      "M38 10C46 8 50 12 48 16",
    ],
  },
  squash: {
    body: [
      "M23 10C23 6 41 6 41 10C41 20 40 26 44 31C52 35 56 42 54 50C52 58 42 60 32 59C22 60 12 58 10 50C8 42 12 35 20 31C24 26 23 20 23 10Z",
    ],
    accent: ["M28 10L28 3L36 3L36 10Z"],
    line: ["M32 32L32 56", "M18 44C22 48 22 52 20 55", "M46 42L48 48"],
  },
  root: {
    body: ["M32 28C16 26 10 40 16 50C20 58 28 58 32 56C36 58 44 58 48 50C54 40 48 26 32 28Z"],
    accent: [
      "M32 28C26 20 18 12 14 14C14 20 22 26 32 28Z",
      "M32 28C34 18 40 8 46 8C48 14 42 24 32 28Z",
      "M32 28C30 18 30 8 32 4C36 10 36 20 32 28Z",
    ],
    line: ["M32 56C32 60 30 62 28 63", "M32 28C26 22 20 16 15 14", "M22 36C20 40 20 44 22 47"],
  },
  long: {
    body: ["M24 18C28 14 40 14 44 18C46 32 38 50 32 62C26 50 18 32 24 18Z"],
    accent: [
      "M30 16C26 10 20 6 16 8C18 14 24 16 30 16Z",
      "M36 16C36 8 38 4 42 4C44 10 40 14 36 16Z",
    ],
    line: ["M27 26l6 0M28 36l5 0M30 46l3 0", "M32 62L32 63"],
  },
  elongated: {
    body: ["M12 44C10 36 20 26 32 22C42 18 52 18 54 24C56 30 48 40 36 48C26 54 14 56 12 44Z"],
    accent: ["M50 20C52 16 56 14 58 16C58 20 54 24 50 22Z"],
    line: ["M20 40C26 34 34 30 42 26M24 48C32 42 40 38 48 30"],
  },
  pepper: {
    body: [
      "M22 22C10 24 8 40 14 50C18 58 26 58 32 54C38 58 46 58 50 50C56 40 54 24 42 22C38 20 36 22 32 22C28 22 26 20 22 22Z",
    ],
    accent: ["M30 22C30 14 34 10 38 8L40 12C38 14 36 18 36 22Z"],
    line: ["M32 24C28 34 28 46 32 54M22 26C20 36 22 46 26 52M42 26C44 36 42 46 38 52"],
  },
  leafy: {
    body: [
      "M32 60C30 50 22 48 16 42C10 38 14 32 10 28C6 22 14 20 14 14C16 8 24 10 26 6C30 2 34 6 38 6C42 8 46 8 50 14C52 20 56 22 52 28C50 32 54 38 48 42C42 48 34 50 32 60Z",
    ],
    accent: [],
    line: ["M32 60L32 12M32 48L20 40M32 40L44 32M32 32L18 24M32 26L46 20M32 20L26 12"],
  },
  cabbage: {
    body: [circle(32, 35, 24)],
    accent: ["M10 30C6 40 12 52 20 54C14 46 12 38 14 30Z"],
    line: ["M32 11C22 24 22 46 32 59M32 11C42 24 42 46 32 59", "M10 35C24 29 40 29 54 35"],
  },
  sprouts: {
    body: [circle(22, 40, 14), circle(44, 41, 13), circle(33, 20, 12)],
    accent: ["M10 52L16 54M50 52L54 54M30 32L34 32"],
    line: [
      "M12 36C18 30 26 34 28 44M34 38C40 34 48 38 50 46M24 18C28 12 36 14 40 22M22 40C20 36 22 32 26 32M44 41C42 37 44 34 47 34",
    ],
  },
  head: {
    body: [circle(21, 28, 12), circle(32, 21, 13), circle(44, 28, 12), circle(32, 33, 13)],
    accent: ["M25 42L25 58L39 58L39 42Z"],
    line: [
      "M15 26C17 22 21 22 23 24M27 18C29 14 35 14 37 18M39 26C41 22 45 22 47 26",
      "M32 42L32 58",
    ],
  },
  stalk: {
    body: [
      "M22 60L20 12C20 8 26 8 26 12L28 60Z",
      "M30 60L30 8C30 4 36 4 36 8L38 60Z",
      "M40 60L42 12C42 8 48 8 48 12L46 60Z",
    ],
    accent: [
      "M20 12C16 6 14 4 12 6C14 10 18 12 20 12Z",
      "M30 8C28 2 28 0 30 0C34 2 34 6 33 8Z",
      "M42 12C46 6 50 4 52 6C50 10 46 12 42 12Z",
    ],
    line: ["M23 20L24 52M33 16L34 52M44 20L43 52"],
  },
  pod: {
    body: ["M8 40C12 24 36 14 56 18C58 30 40 48 14 50C10 50 8 46 8 40Z"],
    accent: ["M56 18C58 14 60 12 62 12L62 16C60 16 58 18 56 18Z"],
    line: [circle(19, 41, 3.5), circle(30, 36, 3.5), circle(41, 30, 3.5)],
  },
  bulb: {
    body: ["M32 14C34 22 50 24 52 40C54 52 44 60 32 60C20 60 10 52 12 40C14 24 30 22 32 14Z"],
    accent: ["M30 14C28 8 30 4 34 2C36 8 34 12 32 14Z"],
    line: [
      "M32 24C26 34 26 50 32 60M32 24C38 34 38 50 32 60M22 30C18 38 18 48 22 54M42 30C46 38 46 48 42 54",
      "M28 60l-2 3M32 60v3M36 60l2 3",
    ],
  },
  ear: {
    body: ["M32 8C42 8 46 22 46 38C46 52 40 58 32 58C24 58 18 52 18 38C18 22 22 8 32 8Z"],
    accent: [
      "M32 58C22 54 12 44 12 28C20 34 26 44 32 58Z",
      "M32 58C42 54 52 44 52 28C44 34 38 44 32 58Z",
    ],
    line: ["M24 20h16M22 28h20M22 36h20M24 44h16M28 12v42M36 12v42"],
  },
  tuber: {
    body: ["M10 38C8 26 20 16 34 16C48 16 58 26 56 38C54 50 42 56 30 56C18 56 12 48 10 38Z"],
    accent: [],
    line: ["M22 30l3 1M38 26l3 1M44 40l3 1M26 44l3 1M16 40l2 1", "M14 32C16 26 22 22 28 20"],
  },
  sprig: {
    body: [
      "M32 22C22 20 16 12 18 8C26 8 32 14 32 22Z",
      "M32 22C42 20 48 12 46 8C38 8 32 14 32 22Z",
      "M32 36C22 34 14 28 14 22C24 22 32 28 32 36Z",
      "M32 36C42 34 50 28 50 22C40 22 32 28 32 36Z",
      "M32 50C24 48 18 44 18 38C26 38 32 42 32 50Z",
      "M32 50C40 48 46 44 46 38C38 38 32 42 32 50Z",
    ],
    accent: [],
    line: ["M32 62L32 8", "M32 22L22 14M32 22L42 14M32 36L22 28M32 36L42 28"],
  },
  cap: {
    body: ["M8 36C8 20 20 10 32 10C44 10 56 20 56 36C56 38 54 40 52 40L12 40C10 40 8 38 8 36Z"],
    accent: ["M24 40L26 58L38 58L40 40Z"],
    line: ["M16 40L20 46M26 40L28 46M36 40L36 46M46 40L44 46", "M18 24C20 20 24 18 28 17"],
  },
  cluster: {
    body: [
      "M10 46C8 34 18 24 26 26C28 18 38 14 44 20C52 20 58 30 54 40C52 48 46 54 40 52C36 58 28 58 24 52C16 54 12 52 10 46Z",
    ],
    accent: ["M28 56C28 50 36 50 36 56L38 62L26 62Z"],
    line: [
      "M16 40C20 34 26 34 28 40M30 32C34 26 40 26 42 32M38 44C42 38 48 38 50 44M20 48C24 44 28 46 30 50",
    ],
  },
  morel: {
    body: ["M32 6C44 8 48 28 46 44L18 44C16 28 20 8 32 6Z"],
    accent: ["M22 44L24 58L40 58L42 44Z"],
    line: [circle(28, 20, 3), circle(37, 26, 3), circle(26, 32, 3), circle(36, 38, 3)],
  },
} as const satisfies Record<string, Shape>;

export type ShapeId = keyof typeof SHAPES;

export type DrawnItem = {
  shape: ShapeId;
  // Watercolor wash of the main body, then the second colour (leaf, stem, husk).
  body: string;
  accent?: string;
};

const RED = "#d4483a";
const CRIMSON = "#b3243a";
const ORANGE = "#e08a2c";
const LEMON = "#e8d23a";
const LIME = "#9cc23c";
const GREEN = "#5f8f3f";
const DEEP_GREEN = "#3f6f3a";
const LEAF = "#6fa24a";
const PEAR = "#cbc247";
const PEACH = "#eea66a";
const PURPLE = "#7a3a6a";
const DEEP_PURPLE = "#4a2a5a";
const BLUE = "#3f5f9a";
const BROWN = "#8a6a4a";
const TAN = "#d8b87a";
const CREAM = "#efe6c8";
const BEET = "#8c2a55";

const d = (shape: ShapeId, body: string, accent?: string): DrawnItem => ({ shape, body, accent });

// One entry per catalog slug: data.test.ts fails on a missing or unknown one.
export const DRAWINGS: Readonly<Record<string, DrawnItem>> = {
  // Fruit
  apple: d("round", RED, GREEN),
  apricot: d("round", "#eba04a", GREEN),
  "asian-pear": d("round", "#d8c05a", GREEN),
  avocado: d("pear", DEEP_GREEN, GREEN),
  blackberry: d("berries", "#3a2a4a", GREEN),
  "blood-orange": d("citrus", "#c0402a", GREEN),
  blueberry: d("berries", BLUE, GREEN),
  cantaloupe: d("melon", "#e8b070", GREEN),
  cherimoya: d("round", "#8fb05a", GREEN),
  cherry: d("cherries", CRIMSON, GREEN),
  "concord-grape": d("grapes", DEEP_PURPLE, GREEN),
  cranberry: d("berries", CRIMSON, GREEN),
  currant: d("berries", "#c8283a", GREEN),
  date: d("tuber", BROWN),
  fig: d("pear", PURPLE, GREEN),
  gooseberry: d("berries", "#a8c060", GREEN),
  grape: d("grapes", LIME, GREEN),
  grapefruit: d("citrus", "#f0a090", GREEN),
  feijoa: d("elongated", "#7aa04a", GREEN),
  honeydew: d("melon", "#cfe0a0", GREEN),
  kiwifruit: d("tuber", "#a08a5a"),
  kumquat: d("citrus", ORANGE, GREEN),
  lemon: d("citrus", LEMON, GREEN),
  lime: d("citrus", LIME, GREEN),
  mandarin: d("citrus", ORANGE, GREEN),
  "meyer-lemon": d("citrus", "#f0c040", GREEN),
  nectarine: d("round", "#e8704a", GREEN),
  olive: d("round", "#7a8a3a", GREEN),
  "navel-orange": d("citrus", ORANGE, GREEN),
  pawpaw: d("elongated", "#b8c060", GREEN),
  peach: d("round", PEACH, GREEN),
  pear: d("pear", PEAR, GREEN),
  persimmon: d("tomato", "#e87a2a", GREEN),
  plum: d("round", PURPLE, GREEN),
  pluot: d("round", "#a04a6a", GREEN),
  pomegranate: d("tomato", "#b8283a", BROWN),
  pomelo: d("citrus", "#d8d070", GREEN),
  quince: d("pear", "#e2c040", GREEN),
  raspberry: d("berries", "#d03a5a", GREEN),
  "sour-cherry": d("cherries", "#c02a3a", GREEN),
  strawberry: d("strawberry", RED, GREEN),
  "valencia-orange": d("citrus", ORANGE, GREEN),
  watermelon: d("melon", "#4f8f4a", "#e0485a"),

  // Vegetables
  "acorn-squash": d("pumpkin", DEEP_GREEN, BROWN),
  artichoke: d("head", "#8aa060", GREEN),
  arugula: d("leafy", "#4f8a3a"),
  asparagus: d("stalk", "#7fa84a", "#5f8f3f"),
  beet: d("root", BEET, GREEN),
  "bell-pepper": d("pepper", RED, GREEN),
  "bok-choy": d("leafy", "#6aa04a"),
  broccoli: d("head", DEEP_GREEN, GREEN),
  "broccoli-rabe": d("leafy", "#3f7a3a"),
  "brussels-sprouts": d("sprouts", "#8fb05a", "#5a7a2a"),
  "butternut-squash": d("squash", "#e0b070", "#7a8a3a"),
  cabbage: d("cabbage", "#8fb878", LEAF),
  carrot: d("long", ORANGE, GREEN),
  cauliflower: d("head", CREAM, GREEN),
  celeriac: d("root", "#c8b890", GREEN),
  celery: d("stalk", "#a8cc7a", "#6fa24a"),
  "cherry-tomato": d("tomato", RED, GREEN),
  chard: d("leafy", "#4a8a4a"),
  "chile-pepper": d("pepper", "#c0281a", GREEN),
  "collard-greens": d("leafy", "#3f7a3f"),
  cucumber: d("elongated", "#5a9a4a", GREEN),
  "dandelion-greens": d("leafy", "#5f9a3f"),
  "delicata-squash": d("squash", "#e8d080", GREEN),
  eggplant: d("elongated", DEEP_PURPLE, GREEN),
  "fava-bean": d("pod", "#8ab05a", GREEN),
  fennel: d("bulb", "#d8e0b0", GREEN),
  fiddleheads: d("sprig", "#6a9a3a"),
  garlic: d("bulb", "#f2efe4", TAN),
  "garlic-scapes": d("stalk", "#8ab05a", GREEN),
  "green-bean": d("pod", "#5f9a3f", GREEN),
  "heirloom-tomato": d("tomato", "#c8402a", GREEN),
  horseradish: d("long", "#e8dcc0", GREEN),
  "kabocha-squash": d("pumpkin", "#4f7a4a", BROWN),
  kale: d("leafy", "#4f7a45"),
  kohlrabi: d("root", "#a8c880", GREEN),
  leek: d("stalk", "#d8e0b8", "#4f8a4a"),
  lettuce: d("leafy", "#8fc060"),
  "mustard-greens": d("leafy", "#5f9a4a"),
  "napa-cabbage": d("cabbage", "#d0e0a0", "#8fb050"),
  okra: d("pod", "#7aa84a", GREEN),
  onion: d("bulb", "#e0b060", TAN),
  parsnip: d("long", "#efe0b8", GREEN),
  potato: d("tuber", "#c8a070"),
  pumpkin: d("pumpkin", ORANGE, GREEN),
  radicchio: d("cabbage", "#a02a4a", "#d8c8b0"),
  radish: d("root", "#d83a5a", GREEN),
  ramps: d("stalk", "#f0eee0", "#4f8a4a"),
  rhubarb: d("stalk", "#c8384a", "#6fa24a"),
  rutabaga: d("root", "#c8a0d0", GREEN),
  scallion: d("stalk", "#f0eedd", "#4f9a4a"),
  shallot: d("bulb", "#c88a6a", TAN),
  "shelling-pea": d("pod", "#7ab04a", GREEN),
  "snap-pea": d("pod", "#8ac05a", GREEN),
  "snow-pea": d("pod", "#9ac86a", GREEN),
  "spaghetti-squash": d("squash", "#f0d860", GREEN),
  spinach: d("leafy", "#3f7a3a"),
  "sungold-tomato": d("tomato", "#f0a020", GREEN),
  sunchoke: d("tuber", "#c8a878"),
  "summer-squash": d("squash", "#f0d040", GREEN),
  "sweet-corn": d("ear", "#f0c830", "#7aa84a"),
  "sweet-potato": d("tuber", "#c8683a"),
  tomato: d("tomato", "#c8281a", GREEN),
  tomatillo: d("tomato", "#a8c860", "#c8b080"),
  turnip: d("root", "#e8d8e8", GREEN),
  watercress: d("sprig", "#4a9a4a"),
  zucchini: d("elongated", "#4f8a3a", GREEN),

  // Herbs
  basil: d("sprig", "#4f8f3a"),
  chives: d("sprig", "#5a9a4a"),
  cilantro: d("sprig", "#5faa4a"),
  dill: d("sprig", "#7fb05a"),
  mint: d("sprig", "#3f9a5a"),
  oregano: d("sprig", "#6a8a3a"),
  parsley: d("sprig", "#3f8a3a"),
  rosemary: d("sprig", "#5a7a4a"),
  sage: d("sprig", "#8aa07a"),
  sorrel: d("sprig", "#6a9a3a"),
  tarragon: d("sprig", "#7a9a4a"),
  thyme: d("sprig", "#6a8a5a"),

  // Mushrooms
  chanterelle: d("cap", "#e0a030", "#f0d890"),
  maitake: d("cluster", "#9a7a5a", "#d9cbb0"),
  morel: d("morel", "#7a6a4a", "#e8dcc0"),
  "oyster-mushroom": d("cluster", "#c8bca8", "#efe8d8"),
};
