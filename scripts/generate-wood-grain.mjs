// Bakes the shelf's wood grain from SVG into raster tiles.
//
// The grain is fractal noise (feTurbulence). As an inline SVG it cost zero
// bytes, but the browser has to GENERATE it per pixel, and it re-generates
// whenever the raster target size changes -- which is exactly what a desktop
// zoom does. That left the library blank for most of a second on every zoom
// step. A raster tile rescales with a cheap filter instead, so zoom costs
// nothing.
//
// The SVGs in scripts/wood-grain/ stay the source of truth: re-theme by
// editing their two colour matrices and re-running this. Output is committed,
// so a normal build needs neither this script nor librsvg.
//
//   node scripts/generate-wood-grain.mjs
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "scripts/wood-grain";
const OUT = "public/shelf";

// density 72 is 1:1 with the SVG's own pixel size; 108 is 1.5x.
// The back panel renders at 1x because it sits under a 47-80% black wash and
// behind the covers, where the extra detail is not visible at any price. The
// pieces you actually look at get 1.5x, which is where the fibre lives.
const TILES = [
  { name: "grain-h", density: 108, quality: 92 },
  { name: "grain-v", density: 108, quality: 92 },
  { name: "grain-back", density: 72, quality: 85 },
];

fs.mkdirSync(OUT, { recursive: true });

for (const { name, density, quality } of TILES) {
  const svg = fs.readFileSync(path.join(SRC, `${name}.svg`));
  // alphaQuality 100 is not optional. Both filters map the noise to a SOLID
  // colour with varying alpha, so the alpha channel IS the grain: lose it and
  // the timber goes flat, however high the colour quality.
  const buf = await sharp(svg, { density })
    .webp({ quality, alphaQuality: 100, effort: 6 })
    .toBuffer();
  const { width, height } = await sharp(buf).metadata();
  fs.writeFileSync(path.join(OUT, `${name}.webp`), buf);
  console.log(`${name}.webp  ${width}x${height}  ${(buf.length / 1024).toFixed(0)}KB`);
}
