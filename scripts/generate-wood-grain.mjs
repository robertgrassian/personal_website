// Bakes the shelf's wood grain into tiling raster tiles.
//
// Two problems are being solved at once, and the second is why this does not
// simply hand a vector file to sharp:
//
//   1. Noise is GENERATED per pixel, and a browser regenerates it whenever the
//      raster target size changes -- which is what a desktop zoom step is.
//      Inline, that blanked the library for most of a second per step. A raster
//      tile rescales with a cheap filter instead.
//   2. The tiles have to WRAP. librsvg (what sharp rasterises SVG with) ignores
//      stitchTiles, so its output tiled with a hard line at every repeat,
//      measured at ~26x the discontinuity of an interior column. So the noise
//      is generated here, by a port of the spec algorithm that Chrome also
//      implements. See ./wood-grain/turbulence.mjs.
//
// The tiles in ./wood-grain/tiles/ are the source of truth: every parameter is
// read out of them, so re-theming is editing a profile and re-running this.
// Output is committed, so a normal build runs neither.
//
//   npm run grain              bake every tile
//   npm run grain -- grain-h   bake one, for a tighter tweak loop
//
// These files used to be SVG, parsed with regexes. That bought one real thing:
// you could open one in a browser and see roughly what the bake would produce.
// The ring primitive is not a filter primitive any browser implements, so that
// stopped being true, and what was left was hand-rolled XML parsing plus a
// 20-number feColorMatrix whose alpha gain lived at index 15 and whose colour
// lived at 4, 9 and 14. Every layer only ever painted one colour at a varying
// alpha, so naming those fields lost no expressiveness and removed a whole
// class of quiet mistake.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildLattice, turbulence } from "./wood-grain/turbulence.mjs";
import { ringField } from "./wood-grain/rings.mjs";

const TILES_DIR = "scripts/wood-grain/tiles";
const OUT = "public/shelf";

// ── validation ────────────────────────────────────────────────────────────
//
// Strict on purpose, and this is the point of the format change. CLAUDE.md
// invites edits to these files, so the failure worth designing out is the
// quiet one: a misspelled key that a forgiving parser drops, leaving a tile
// that bakes cleanly and looks subtly wrong. Every rule below throws, names
// the file, and names the field.

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isFreq = (v) => Array.isArray(v) && v.length === 2 && v.every(isNum);
const isInt = (v) => Number.isInteger(v);

// [validator, description] per field, by layer type. Keys not listed here are
// rejected rather than ignored.
const COMMON_FIELDS = {
  type: [(v) => v === "noise" || v === "rings", '"noise" or "rings"'],
  color: [(v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v), "a #rrggbb colour"],
  gain: [isNum, "a number"],
  offset: [isNum, "a number"],
};

const LAYER_FIELDS = {
  noise: {
    ...COMMON_FIELDS,
    baseFrequency: [isFreq, "two numbers, [x, y]"],
    octaves: [(v) => isInt(v) && v >= 1, "an integer of 1 or more"],
    seed: [isNum, "a number"],
  },
  rings: {
    ...COMMON_FIELDS,
    along: [(v) => v === "x" || v === "y", '"x" or "y"'],
    seed: [isNum, "a number"],
    ringFrequency: [(v) => isNum(v) && v > 0, "a number above 0"],
    latewood: [(v) => isNum(v) && v > 0 && v < 1, "a number between 0 and 1"],
    center: [(v) => isNum(v) && v >= 0 && v <= 1, "a number from 0 to 1"],
    pith: [(v) => isNum(v) && v > 0, "a number above 0"],
    drift: [(v) => isNum(v) && v >= 0, "a number of 0 or more"],
    driftFrequency: [isFreq, "two numbers, [x, y]"],
    jitter: [(v) => isNum(v) && v >= 0, "a number of 0 or more"],
    jitterFrequency: [isFreq, "two numbers, [x, y]"],
  },
};

function checkFields(value, fields, where) {
  // Unknown keys first. A misspelled key is also a missing key, and "unknown
  // field 'octave'" points at the typo where "missing 'octaves'" sends you
  // looking for a field that is sitting right there.
  for (const key of Object.keys(value)) {
    if (!(key in fields)) {
      throw new Error(
        `${where} has an unknown field '${key}'. Known fields: ${Object.keys(fields).join(", ")}`
      );
    }
  }
  for (const [key, [ok, expected]] of Object.entries(fields)) {
    if (!(key in value)) throw new Error(`${where} is missing '${key}': expected ${expected}`);
    if (!ok(value[key])) {
      throw new Error(
        `${where} has a bad '${key}': expected ${expected}, got ${JSON.stringify(value[key])}`
      );
    }
  }
}

/** Validate one tile profile, or throw naming the file and the field. */
export function parseProfile(profile, name = "profile") {
  if (profile === null || typeof profile !== "object") {
    throw new Error(`${name} must export an object as its default export`);
  }
  const { tile, scale, quality, layers } = profile;
  if (
    tile === undefined ||
    !isInt(tile.width) ||
    !isInt(tile.height) ||
    tile.width < 1 ||
    tile.height < 1
  ) {
    throw new Error(`${name}: 'tile' needs whole-number width and height above 0`);
  }
  if (!isNum(scale) || scale <= 0) throw new Error(`${name}: 'scale' must be a number above 0`);
  if (!isInt(quality) || quality < 1 || quality > 100) {
    throw new Error(`${name}: 'quality' must be a whole number from 1 to 100`);
  }
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new Error(`${name}: 'layers' must be a non-empty array, painted bottom-most first`);
  }
  // Any key beyond the four above is a typo, not an extension point.
  for (const key of Object.keys(profile)) {
    if (!["tile", "scale", "quality", "layers"].includes(key)) {
      throw new Error(
        `${name} has an unknown field '${key}'. Known fields: tile, scale, quality, layers`
      );
    }
  }
  layers.forEach((layer, i) => {
    if (layer === null || typeof layer !== "object")
      throw new Error(`${name} layer ${i} is not an object`);
    const fields = LAYER_FIELDS[layer.type];
    if (fields === undefined) {
      throw new Error(
        `${name} layer ${i} has type ${JSON.stringify(layer.type)}; expected "noise" or "rings"`
      );
    }
    checkFields(layer, fields, `${name} layer ${i} (${layer.type})`);
  });
  return profile;
}

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

// ── rendering ─────────────────────────────────────────────────────────────

/** The scalar field of one noise layer, in [0,1] per pixel. */
function noiseField(layer, width, height, scale) {
  const ctx = buildLattice(layer.seed);
  const opts = {
    fractal: true,
    octaves: layer.octaves,
    stitchTiles: true,
    baseFreqX: layer.baseFrequency[0],
    baseFreqY: layer.baseFrequency[1],
    tileWidth: width,
    tileHeight: height,
  };
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const out = new Float64Array(w * h);
  for (let py = 0; py < h; py++) {
    // Sample at pixel centres, in the tile's own user units, so a scaled render
    // is the same field at finer resolution and stays periodic over the tile.
    const uy = (py + 0.5) / scale;
    for (let px = 0; px < w; px++) {
      out[py * w + px] = turbulence(ctx, 0, (px + 0.5) / scale, uy, opts);
    }
  }
  return { data: out, w, h };
}

/** One layer, as non-premultiplied RGBA in [0,1]: a flat colour at a varying alpha. */
export function renderLayer(layer, width, height, scale) {
  const field =
    layer.type === "rings"
      ? ringField(layer, width, height, scale)
      : noiseField(layer, width, height, scale);
  const [r, g, b] = rgb(layer.color);
  const out = new Float64Array(field.w * field.h * 4);
  for (let i = 0; i < field.w * field.h; i++) {
    const o = i * 4;
    const a = layer.gain * field.data[i] + layer.offset;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = a < 0 ? 0 : a > 1 ? 1 : a;
  }
  return { data: out, w: field.w, h: field.h };
}

/** Source-over, on non-premultiplied colour. */
export function over(top, bottom) {
  const n = bottom.data.length / 4;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const aT = top.data[o + 3];
    const aB = bottom.data[o + 3];
    const aOut = aT + aB * (1 - aT);
    for (let c = 0; c < 3; c++) {
      bottom.data[o + c] =
        aOut === 0 ? 0 : (top.data[o + c] * aT + bottom.data[o + c] * aB * (1 - aT)) / aOut;
    }
    bottom.data[o + 3] = aOut;
  }
  return bottom;
}

/** Composite one validated profile to non-premultiplied 8-bit RGBA. */
export function buildTile(profile) {
  const { width, height } = profile.tile;
  let composite = null;
  for (const layer of profile.layers) {
    const rendered = renderLayer(layer, width, height, profile.scale);
    composite = composite === null ? rendered : over(rendered, composite);
  }
  const bytes = Buffer.alloc(composite.data.length);
  for (let i = 0; i < composite.data.length; i++) bytes[i] = Math.round(composite.data[i] * 255);
  return { bytes, width: composite.w, height: composite.h };
}

/** Every tile profile in TILES_DIR, validated, keyed by output basename. */
export async function loadProfiles(dir = TILES_DIR) {
  const names = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mjs"))
    .sort();
  const out = new Map();
  for (const file of names) {
    const mod = await import(pathToFileURL(path.resolve(dir, file)).href);
    const name = file.replace(/\.mjs$/, "");
    out.set(name, parseProfile(mod.default, `${dir}/${file}`));
  }
  return out;
}

// Only bake when run as a script. The parser, renderer and tile builder are
// exported so they can be exercised without writing files.
const isCli =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const profiles = await loadProfiles();
  const wanted = process.argv.slice(2);
  for (const name of wanted) {
    if (!profiles.has(name)) {
      throw new Error(`no tile called '${name}'. Available: ${[...profiles.keys()].join(", ")}`);
    }
  }
  const baking = wanted.length > 0 ? wanted : [...profiles.keys()];

  fs.mkdirSync(OUT, { recursive: true });
  for (const name of baking) {
    const { bytes, width: w, height: h } = buildTile(profiles.get(name));

    // alphaQuality 100 is not optional: every layer paints one colour at a
    // varying alpha, so the alpha channel IS the grain.
    const buf = await sharp(bytes, { raw: { width: w, height: h, channels: 4 } })
      .webp({ quality: profiles.get(name).quality, alphaQuality: 100, effort: 6 })
      .toBuffer();

    fs.writeFileSync(path.join(OUT, `${name}.webp`), buf);
    console.log(`${name}.webp  ${w}x${h}  ${(buf.length / 1024).toFixed(0)}KB`);
  }
}
