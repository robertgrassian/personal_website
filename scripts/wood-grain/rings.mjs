// Growth rings, which fractal noise cannot produce at any setting.
//
// Why this exists: feTurbulence has no period. Real wood does -- a wide pale
// earlywood band, then a narrow dark latewood band, over and over -- and that
// periodicity is most of what the eye uses to tell timber from a smear. Every
// parameter in the old grain was tuning the smear.
//
// The model is the log, not a picture of a plank. A log is cylinders around
// its pith; a board is a plane cut a distance d from that axis, so a ring of
// radius R shows up where R = sqrt(across^2 + d^2). Hold d constant and the
// rings are straight lines, which is quartersawn. Let d drift along the
// board's length and they splay into the arches that read as flatsawn.
//
// The drift MUST come from a stitched turbulence. Stitched noise is periodic
// over the tile, so a d built from it is periodic too. Anything else (a linear
// taper, an unstitched noise) puts a seam back at every repeat, the exact
// failure turbulence.mjs exists to avoid.
//
// That is NOT sufficient on its own, which cost a shipped tile to learn. R also
// takes `across`, a bare linear ramp in the tile coordinate with no period at
// all. It survives only because it enters SQUARED and is measured from the
// middle of the tile: the pixel centres are then mirror-symmetric about that
// line, so the first and last columns see the same across^2 and the field
// wraps. Measure it from anywhere else and the ring phase restarts at random on
// every repeat -- grain-back shipped at 0.42 of its width and seamed 82x worse
// than an interior column. Hence no `center` parameter: the only value that
// tiles is the one this hardcodes, so it is not offered.

import { buildLattice, turbulence } from "./turbulence.mjs";

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const frac = (v) => v - Math.floor(v);
const smooth = (a, b, t) => {
  const u = clamp((t - a) / (b - a));
  return u * u * (3 - 2 * u);
};

/**
 * One ring, as a function of position within it: 0 is earlywood, 1 the middle
 * of the latewood band. Exported so it can be tested directly -- the banding is
 * periodic in R, not in the tile coordinate (R is a square root, so rings are
 * not evenly spaced on screen), which makes this shape impossible to assert
 * from the rendered field without re-implementing the geometry.
 *
 * @param t position within one ring, in [0,1)
 * @param late fraction of the ring that is latewood; must stay under 1/1.06
 */
export function bandProfile(t, late) {
  // Fades in gradually and ends sharply. That asymmetry is what reads as a ring
  // rather than as a stripe; a symmetric band looks printed.
  //
  // Both edges are smooth steps even so. A hard cut aliases into a staircase
  // wherever R changes slowly across the board, which is most of it, and the
  // staircase survives every later resample. The trailing edge finishes at
  // late * 1.06, which is why late itself has to stay below 1/1.06: past that
  // the fall never completes before t wraps and the hard edge comes back.
  return smooth(0, late * 0.8, t) * (1 - smooth(late * 0.88, late * 1.06, t));
}

function noiseOpts(freq, octaves, tileWidth, tileHeight) {
  return {
    fractal: true,
    octaves,
    stitchTiles: true,
    baseFreqX: freq[0],
    baseFreqY: freq[1],
    tileWidth,
    tileHeight,
  };
}

/**
 * The ring field over one tile, as a scalar in [0,1] per pixel: 0 is
 * earlywood, 1 the middle of a latewood band. The caller turns that into a
 * colour and an alpha, exactly as it does for a noise layer.
 *
 * @param layer a validated `rings` layer (see parseProfile)
 * @param scale samples per user unit; the field itself does not change with it
 */
export function ringField(layer, width, height, scale) {
  // Two independent lattices: one warps the board's distance from the pith
  // along its length, the other roughens each ring so no two are identical.
  // The +7 is arbitrary but fixed -- reusing one lattice correlates the wobble
  // with the arch and the rings come out visibly mechanical.
  const warpCtx = buildLattice(layer.seed);
  const jitterCtx = buildLattice(layer.seed + 7);
  const warpOpts = noiseOpts(layer.driftFrequency, 2, width, height);
  const jitterOpts = noiseOpts(layer.jitterFrequency, 3, width, height);

  const alongX = layer.along === "x";
  const acrossLength = alongX ? height : width;
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const out = new Float64Array(w * h);

  for (let py = 0; py < h; py++) {
    const uy = (py + 0.5) / scale;
    for (let px = 0; px < w; px++) {
      const ux = (px + 0.5) / scale;
      // Measured from the mid-line, always: see the header. Moving it breaks
      // the wrap on this axis.
      const across = (alongX ? uy : ux) - acrossLength / 2;
      const d = layer.pith + layer.drift * (turbulence(warpCtx, 0, ux, uy, warpOpts) - 0.5);
      const R =
        Math.sqrt(across * across + d * d) +
        layer.jitter * (turbulence(jitterCtx, 0, ux, uy, jitterOpts) - 0.5);

      out[py * w + px] = bandProfile(frac(R * layer.ringFrequency), layer.latewood);
    }
  }
  return { data: out, w, h };
}
