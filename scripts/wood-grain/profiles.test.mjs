// The grain baker had no test at all, while exporting its internals "so they
// can be exercised without writing files". These are the checks that would
// have caught the failures this pipeline has actually had.

import test from "node:test";
import assert from "node:assert/strict";
import { parseProfile, renderLayer, buildTile, loadProfiles } from "../generate-wood-grain.mjs";
import { bandProfile, ringField } from "./rings.mjs";

const noise = {
  type: "noise",
  color: "#8a6339",
  gain: 0.55,
  offset: -0.22,
  baseFrequency: [0.003, 0.006],
  octaves: 2,
  seed: 5,
};
const rings = {
  type: "rings",
  color: "#26150a",
  gain: 0.6,
  offset: 0.06,
  along: "x",
  seed: 17,
  ringFrequency: 0.3,
  latewood: 0.3,
  pith: 17,
  drift: 22,
  driftFrequency: [0.006, 0.0006],
  jitter: 2,
  jitterFrequency: [0.035, 0.55],
};
const profile = (...layers) => ({
  tile: { width: 32, height: 16 },
  scale: 1,
  quality: 90,
  layers,
});

// ── validation ────────────────────────────────────────────────────────────
//
// The point of the format: a mistake in a hand-edited profile has to be loud.
// The parser these replaced was regex over XML, and its own comment recorded
// the failure mode -- a lazy match could pair one filter's id with the NEXT
// filter's parameters and bake a tile that silently did not match its source.

test("accepts the layer types the baker can paint", () => {
  assert.doesNotThrow(() => parseProfile(profile(noise, rings)));
});

test("a misspelled field is an error, not a silent default", () => {
  const typo = { ...noise, octave: 2 };
  delete typo.octaves;
  assert.throws(() => parseProfile(profile(typo)), /unknown field 'octave'/);
});

test("a misspelled TOP-LEVEL field also reads as a typo", () => {
  // Both paths have to report the typo rather than the field it displaced, or
  // the message sends you looking for something that is sitting right there.
  const typo = { ...profile(noise), scaleX: 2 };
  delete typo.scale;
  assert.throws(() => parseProfile(typo), /unknown field 'scaleX'/);
});

test("a missing field names the field", () => {
  const short = { ...rings };
  delete short.pith;
  assert.throws(() => parseProfile(profile(short)), /missing 'pith'/);
});

test("an out-of-range value is rejected rather than clamped", () => {
  assert.throws(() => parseProfile(profile({ ...noise, octaves: 0 })), /octaves/);
  assert.throws(() => parseProfile(profile({ ...noise, color: "#abc" })), /color/);
});

test("latewood is capped where the band stops being continuous", () => {
  // Not an arbitrary bound: see the band-profile tests below. Past 1/1.06 the
  // trailing edge cannot finish before the ring wraps.
  assert.doesNotThrow(() => parseProfile(profile({ ...rings, latewood: 0.94 })));
  assert.throws(() => parseProfile(profile({ ...rings, latewood: 0.99 })), /latewood/);
});

test("a negative frequency is rejected", () => {
  // It snaps to a negative stitch width, so the wrap logic stops working
  // without failing -- exactly the quiet mode this format exists to remove.
  assert.throws(
    () => parseProfile(profile({ ...noise, baseFrequency: [-0.1, 0.006] })),
    /baseFrequency/
  );
  assert.throws(
    () => parseProfile(profile({ ...rings, driftFrequency: [0.006, -0.1] })),
    /driftFrequency/
  );
});

test("a single number for baseFrequency is rejected", () => {
  // SVG let one value mean both axes. Nothing here does, and a profile written
  // from memory of the old format must not bake an isotropic tile in silence.
  assert.throws(() => parseProfile(profile({ ...noise, baseFrequency: 0.1 })), /baseFrequency/);
});

test("an unknown layer type is rejected", () => {
  assert.throws(
    () => parseProfile(profile({ ...noise, type: "feTurbulence" })),
    /expected "noise" or "rings"/
  );
});

test("inherited property names are not mistaken for known fields", () => {
  // `key in fields` walks the prototype chain, so 'toString' and friends passed
  // as known and then skipped validation entirely -- in the one function whose
  // whole job is rejecting unknown keys.
  for (const key of ["toString", "constructor", "valueOf", "hasOwnProperty"]) {
    assert.throws(
      () => parseProfile(profile({ ...noise, [key]: 1 })),
      new RegExp(`unknown field '${key}'`),
      `layer field ${key} slipped through`
    );
  }
  assert.throws(() => parseProfile(profile({ ...noise, type: "constructor" })), /expected "noise"/);
});

test("a malformed tile names the field instead of throwing a TypeError", () => {
  for (const tile of [null, 5, [32, 16]]) {
    assert.throws(() => parseProfile({ ...profile(noise), tile }), /'tile'/);
  }
  assert.throws(
    () => parseProfile({ ...profile(noise), tile: { width: 32, height: 16, depth: 3 } }),
    /unknown field 'depth'/
  );
});

test("a scale that rounds the tile away is rejected before sharp sees it", () => {
  // Otherwise buildTile returns a zero-length buffer and the encoder fails with
  // an error about anything but the real cause.
  assert.throws(() => parseProfile({ ...profile(noise), scale: 0.001 }), /rounds/);
});

// ── the tiles have to wrap ────────────────────────────────────────────────
//
// This is the property the whole pipeline exists for. librsvg ignored
// stitchTiles and its tiles seamed at every repeat, ~26x the discontinuity of
// an interior column.
//
// A ring layer can break it in two independent ways, so both axes are checked
// on every tile. The drift and jitter run ALONG the grain and must come from a
// stitched turbulence; `across` runs the other way and is a bare linear ramp,
// saved only by being squared about the tile's mid-line. An earlier version of
// this test compared one axis against the MAXIMUM interior gap, which the
// top pore layer sets so high that a fully unstitched drift passed on two of
// the three tiles.

function seams(tile) {
  const { bytes, width: w, height: h } = tile;
  const at = (x, y, c) => bytes[(y * w + x) * 4 + c];
  const col = (a, b) => {
    let s = 0;
    for (let y = 0; y < h; y++)
      for (let c = 0; c < 4; c++) s += Math.abs(at(a, y, c) - at(b, y, c));
    return s / (h * 4);
  };
  const row = (a, b) => {
    let s = 0;
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) s += Math.abs(at(x, a, c) - at(x, b, c));
    return s / (w * 4);
  };
  const median = (v) => v.sort((p, q) => p - q)[v.length >> 1];
  const ix = [];
  for (let x = 0; x < w - 1; x++) ix.push(col(x, x + 1));
  const iy = [];
  for (let y = 0; y < h - 1; y++) iy.push(row(y, y + 1));
  return { x: col(w - 1, 0), y: row(h - 1, 0), mx: median(ix), my: median(iy) };
}

// The seam must look like an ordinary interior transition. Measured headroom:
// the shipped tiles sit at 0.47-1.25x their median, an off-centre `across` at
// 1.35-1.52x, and an unstitched drift at 15-19x. The absolute floor is for the
// axes where every gap is under a byte or two and the ratio stops meaning
// anything -- a seam that small is invisible however it compares.
const SEAM_RATIO = 1.3;
const SEAM_FLOOR = 2;

test("every shipped tile wraps on BOTH axes", async () => {
  for (const [name, p] of await loadProfiles()) {
    const s = seams(buildTile(p));
    assert.ok(
      s.x <= Math.max(SEAM_RATIO * s.mx, SEAM_FLOOR),
      `${name} seams left-to-right: ${s.x.toFixed(2)} against a median interior column of ${s.mx.toFixed(2)}`
    );
    assert.ok(
      s.y <= Math.max(SEAM_RATIO * s.my, SEAM_FLOOR),
      `${name} seams top-to-bottom: ${s.y.toFixed(2)} against a median interior row of ${s.my.toFixed(2)}`
    );
  }
});

// ── the ring band ─────────────────────────────────────────────────────────
//
// Tested through bandProfile rather than through the rendered field, because
// the banding is periodic in R and R is a square root: rings are NOT evenly
// spaced in the tile coordinate, so there is no lag at which the output
// autocorrelates. Asserting the shape from the pixels would mean
// re-implementing the geometry in the test, which tests nothing.

test("the ring band is continuous where one ring meets the next", () => {
  // A discontinuity here is the aliased staircase both edges are smoothed to
  // avoid, and it survives every later resample.
  for (const late of [0.1, 0.3, 0.5, 0.8, 0.94]) {
    const step = Math.abs(bandProfile(0.999999, late) - bandProfile(0, late));
    assert.ok(step < 0.001, `latewood ${late} steps by ${step.toFixed(4)} at the ring boundary`);
  }
});

test("the validator's latewood cap is exactly where continuity breaks", () => {
  // Guards the bound against being "tidied" to a round 1.
  assert.ok(Math.abs(bandProfile(0.999999, 1 / 1.06 - 0.001)) < 0.001);
  assert.ok(bandProfile(0.999999, 0.99) > 0.1, "0.99 should still show the hard edge");
});

test("the band fades in and ends sharply, which is what reads as a ring", () => {
  const late = 0.3;
  assert.ok(bandProfile(late * 0.85, late) > 0.9, "band never reaches full strength");

  // Compare the two ramps at half height. A symmetric band looks printed, so
  // the asymmetry is the point rather than a detail of the easing.
  const end = late * 1.06;
  const step = end / 20000;
  let up = null;
  let down = null;
  for (let t = 0; t <= end; t += step) {
    if (up === null && bandProfile(t, late) >= 0.5) up = t;
    if (up !== null && down === null && bandProfile(t, late) <= 0.5 && t > late * 0.85) down = t;
  }
  const leading = up;
  const trailing = end - down;
  assert.ok(
    leading > trailing * 2,
    `leading ramp ${leading.toFixed(4)} is not clearly longer than the trailing ${trailing.toFixed(4)}`
  );
});

// ── rendering ─────────────────────────────────────────────────────────────

test("gain and offset are the alpha, clamped to [0,1]", () => {
  const flat = renderLayer({ ...noise, gain: 0, offset: 0.5 }, 8, 8, 1);
  assert.equal(flat.data[3], 0.5);
  const over = renderLayer({ ...noise, gain: 0, offset: 9 }, 8, 8, 1);
  assert.equal(over.data[3], 1);
  const under = renderLayer({ ...noise, gain: 0, offset: -9 }, 8, 8, 1);
  assert.equal(under.data[3], 0);
});

test("scale changes resolution, not the field", () => {
  // A 2x render must be the same wood sampled finer, or the committed tile
  // stops matching the profile it claims to come from.
  //
  // Box-decimating the 2x render lands its samples exactly on the 1x pixel
  // centres, so the two are directly comparable. Comparing MEAN alpha instead
  // (an earlier version of this test) compares only the duty cycle, which
  // barely moves: sampling pixel indices rather than user units -- the literal
  // bug this names -- shifted it by 0.005 and passed.
  for (const layer of [rings, noise]) {
    const one = ringOrNoise(layer, 1);
    const two = ringOrNoise(layer, 2);
    assert.equal(two.w, one.w * 2);
    let sum = 0;
    const q = (y, x) => two.data[y * two.w + x];
    for (let y = 0; y < one.h; y++) {
      for (let x = 0; x < one.w; x++) {
        const boxed =
          (q(2 * y, 2 * x) + q(2 * y, 2 * x + 1) + q(2 * y + 1, 2 * x) + q(2 * y + 1, 2 * x + 1)) /
          4;
        sum += Math.abs(boxed - one.data[y * one.w + x]);
      }
    }
    const err = sum / (one.w * one.h);
    // Correct code lands at 0.06-0.07 (the box average is exact only for a
    // locally linear field); sampling pixel indices lands at 0.27.
    assert.ok(
      err < 0.15,
      `${layer.type} field moved when only the scale changed: ${err.toFixed(4)}`
    );
  }
});

function ringOrNoise(layer, scale) {
  if (layer.type === "rings") return ringField(layer, 64, 32, scale);
  // renderLayer returns RGBA; pull the alpha back out to a scalar field.
  const r = renderLayer(layer, 64, 32, scale);
  const data = new Float64Array(r.w * r.h);
  for (let i = 0; i < data.length; i++) data[i] = (r.data[i * 4 + 3] - layer.offset) / layer.gain;
  return { data, w: r.w, h: r.h };
}

test("the committed profiles are valid and name their real output sizes", async () => {
  const profiles = await loadProfiles();
  assert.deepEqual([...profiles.keys()].sort(), ["grain-back", "grain-h", "grain-v"]);
  // The CSS paints each tile at its natural size, so a profile that disagrees
  // with background-size in shelf-themes.css tiles at the wrong pitch.
  assert.deepEqual(profiles.get("grain-h").tile, { width: 512, height: 56 });
  assert.deepEqual(profiles.get("grain-v").tile, { width: 56, height: 512 });
  assert.deepEqual(profiles.get("grain-back").tile, { width: 384, height: 512 });
});
