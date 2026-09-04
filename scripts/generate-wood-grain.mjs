// Bakes the shelf's wood grain from SVG into tiling raster tiles.
//
// Two problems are being solved at once, and the second is why this does not
// simply hand the SVG to sharp:
//
//   1. feTurbulence GENERATES its noise per pixel, and the browser regenerates
//      it whenever the raster target size changes -- which is what a desktop
//      zoom step is. Inline, that blanked the library for most of a second per
//      step. A raster tile rescales with a cheap filter instead.
//   2. The tiles have to WRAP. librsvg (what sharp rasterises SVG with) ignores
//      stitchTiles, so its output tiled with a hard line at every repeat,
//      measured at ~26x the discontinuity of an interior column. So the noise
//      is generated here, by a port of the spec algorithm that Chrome also
//      implements. See ./wood-grain/turbulence.mjs.
//
// The SVGs in scripts/wood-grain/ stay the source of truth: every parameter
// below is read out of them, so re-theming is still editing a colour matrix
// and re-running this. Output is committed, so a normal build runs neither.
//
//   npm run grain
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLattice, turbulence } from "./wood-grain/turbulence.mjs";

const SRC = "scripts/wood-grain";
const OUT = "public/shelf";

// scale 1 is 1:1 with the SVG's own pixel size, which is also the CSS size the
// tile is painted at. So scale 2 is what a 2x display needs to avoid upscaling
// the fibre into mush -- the inline SVG used to be generated at full device
// resolution, and anything less than 2 here is visibly softer than it was.
// The back panel is the one exception: it sits under a 47-80% black wash and
// behind the covers, so 1.5x is spent where nobody can see it as it is.
const TILES = [
  { name: "grain-h", scale: 2, quality: 92 },
  { name: "grain-v", scale: 2, quality: 92 },
  { name: "grain-back", scale: 1.5, quality: 85 },
];

export function parseSvg(svg) {
  const size = svg.match(/width='(\d+)'\s+height='(\d+)'/);
  if (size === null) throw new Error("source SVG has no single-quoted width/height on <svg>");
  const width = Number(size[1]);
  const height = Number(size[2]);

  // Attributes are read by NAME, not by position, and each filter is matched as
  // a bounded block. An earlier version used one lazy regex spanning
  // <filter ...><feTurbulence ...>, which could run past the end of one filter
  // and pair its id with the NEXT filter's parameters -- baking a tile that
  // silently did not match its source. CLAUDE.md invites edits to these files,
  // so wrong-but-quiet is the failure mode worth designing out.
  const attr = (s, name) => {
    const m = s.match(new RegExp(`\\b${name}='([^']*)'`));
    return m === null ? null : m[1];
  };

  const filters = new Map();
  for (const m of [...svg.matchAll(/<filter\b([\s\S]*?)<\/filter>/g)]) {
    const body = m[1];
    const id = attr(body, "id");
    if (id === null) throw new Error("a <filter> in the source SVG has no id");
    const turb = body.match(/<feTurbulence\b[^>]*\/>/);
    const mat = body.match(/<feColorMatrix\b[^>]*\/>/);
    if (turb === null || mat === null) {
      throw new Error(`filter '${id}' needs both an feTurbulence and an feColorMatrix`);
    }
    const freq = (attr(turb[0], "baseFrequency") ?? "").trim().split(/\s+/).map(Number);
    if (freq.length === 0 || freq.some(Number.isNaN)) {
      throw new Error(`filter '${id}' has no usable baseFrequency`);
    }
    const values = (attr(mat[0], "values") ?? "").trim().split(/\s+/).map(Number);
    if (values.length !== 20 || values.some(Number.isNaN)) {
      throw new Error(`filter '${id}' needs 20 numbers in its feColorMatrix values`);
    }
    filters.set(id, {
      fractal: attr(turb[0], "type") === "fractalNoise",
      baseFreqX: freq[0],
      // A single value means the same frequency on both axes, per the spec.
      baseFreqY: freq.length > 1 ? freq[1] : freq[0],
      octaves: Number(attr(turb[0], "numOctaves") ?? 1),
      seed: Number(attr(turb[0], "seed") ?? 0),
      stitchTiles: attr(turb[0], "stitchTiles") === "stitch",
      matrix: values,
    });
  }

  // Paint order: the rects reference filters by id, bottom-most first. Anything
  // this baker cannot paint is an error rather than a silent omission -- a
  // browser previewing the same file WOULD paint it, so the two would diverge.
  const layers = [...svg.matchAll(/<rect\b[^>]*>/g)].map(([rect]) => {
    const ref = (attr(rect, "filter") ?? "").match(/^url\(#(.+)\)$/);
    if (ref === null) {
      throw new Error(
        `unfiltered <rect> in the source SVG: ${rect}. This baker paints nothing else.`
      );
    }
    const layer = filters.get(ref[1]);
    if (layer === undefined) throw new Error(`<rect> references unknown filter '${ref[1]}'`);
    return layer;
  });
  if (layers.length === 0) throw new Error("no <rect> found in the source SVG");
  return { width, height, layers };
}

/** One filtered rect, as non-premultiplied RGBA in [0,1]. */
export function renderLayer(layer, width, height, scale) {
  const ctx = buildLattice(layer.seed);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const out = new Float64Array(w * h * 4);
  const mx = layer.matrix;

  // Only compute the turbulence channels the colour matrix actually reads.
  // These matrices map the noise to a solid colour with a varying alpha, so in
  // practice that is channel 0 alone, and computing four would be 4x the work
  // for identical output.
  const used = [0, 1, 2, 3].filter((c) => [0, 1, 2, 3].some((row) => mx[row * 5 + c] !== 0));
  const opts = {
    fractal: layer.fractal,
    octaves: layer.octaves,
    stitchTiles: layer.stitchTiles,
    baseFreqX: layer.baseFreqX,
    baseFreqY: layer.baseFreqY,
    tileWidth: width,
    tileHeight: height,
  };

  const src = [0, 0, 0, 0];
  for (let py = 0; py < h; py++) {
    // Sample at pixel centres, in the SVG's own user units, so a scaled render
    // is the same field at finer resolution and stays periodic over the tile.
    const uy = (py + 0.5) / scale;
    for (let px = 0; px < w; px++) {
      const ux = (px + 0.5) / scale;
      for (const c of used) src[c] = turbulence(ctx, c, ux, uy, opts);
      const o = (py * w + px) * 4;
      for (let row = 0; row < 4; row++) {
        const v =
          mx[row * 5] * src[0] +
          mx[row * 5 + 1] * src[1] +
          mx[row * 5 + 2] * src[2] +
          mx[row * 5 + 3] * src[3] +
          mx[row * 5 + 4];
        out[o + row] = Math.min(1, Math.max(0, v));
      }
    }
  }
  return { data: out, w, h };
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

/** Composite one named tile to non-premultiplied 8-bit RGBA. */
export function buildTile(name, scale) {
  const svg = fs.readFileSync(path.join(SRC, `${name}.svg`), "utf8");
  const { width, height, layers } = parseSvg(svg);
  let composite = null;
  for (const layer of layers) {
    const rendered = renderLayer(layer, width, height, scale);
    composite = composite === null ? rendered : over(rendered, composite);
  }
  const bytes = Buffer.alloc(composite.data.length);
  for (let i = 0; i < composite.data.length; i++) bytes[i] = Math.round(composite.data[i] * 255);
  return { bytes, width: composite.w, height: composite.h };
}

// Only bake when run as a script. The parser and tile builder are exported so
// they can be exercised without writing files.
const isCli =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  fs.mkdirSync(OUT, { recursive: true });

  for (const { name, scale, quality } of TILES) {
    const { bytes, width: w, height: h } = buildTile(name, scale);

    // alphaQuality 100 is not optional: the colour matrices map the noise to a
    // solid colour with varying alpha, so the alpha channel IS the grain.
    const buf = await sharp(bytes, {
      raw: { width: w, height: h, channels: 4 },
    })
      .webp({ quality, alphaQuality: 100, effort: 6 })
      .toBuffer();

    fs.writeFileSync(path.join(OUT, `${name}.webp`), buf);
    console.log(`${name}.webp  ${w}x${h}  ${(buf.length / 1024).toFixed(0)}KB`);
  }
}
