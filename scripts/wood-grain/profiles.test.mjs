// The grain baker had no test at all, while exporting its internals "so they
// can be exercised without writing files". These are the checks that would
// have caught the failures this pipeline has actually had.

import test from "node:test";
import assert from "node:assert/strict";
import { parseProfile, renderLayer, buildTile, loadProfiles } from "../generate-wood-grain.mjs";

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
  center: 0.5,
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

test("a missing field names the field", () => {
  const short = { ...rings };
  delete short.pith;
  assert.throws(() => parseProfile(profile(short)), /missing 'pith'/);
});

test("an out-of-range value is rejected rather than clamped", () => {
  // latewood is a fraction of one ring; at 1 the dark band swallows the ring
  // and the layer silently turns into a flat wash.
  assert.throws(() => parseProfile(profile({ ...rings, latewood: 1 })), /latewood/);
  assert.throws(() => parseProfile(profile({ ...noise, octaves: 0 })), /octaves/);
  assert.throws(() => parseProfile(profile({ ...noise, color: "#abc" })), /color/);
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

test("an unknown top-level field is rejected", () => {
  assert.throws(
    () => parseProfile({ ...profile(noise), scaleFactor: 2 }),
    /unknown field 'scaleFactor'/
  );
});

// ── the tiles have to wrap ────────────────────────────────────────────────
//
// This is the property the whole pipeline exists for. librsvg ignored
// stitchTiles and its tiles seamed at every repeat, ~26x the discontinuity of
// an interior column. The ring layer is the new way to break it: its arches
// come from a drift along the board, and a drift built from anything
// non-periodic puts the seam straight back.

function columnGap(tile, a, b) {
  let sum = 0;
  for (let y = 0; y < tile.height; y++) {
    for (let c = 0; c < 4; c++) {
      sum += Math.abs(
        tile.bytes[(y * tile.width + a) * 4 + c] - tile.bytes[(y * tile.width + b) * 4 + c]
      );
    }
  }
  return sum / (tile.height * 4);
}

test("every shipped tile wraps: the seam is no worse than an interior column", async () => {
  for (const [name, p] of await loadProfiles()) {
    const tile = buildTile(p);
    const seam = columnGap(tile, tile.width - 1, 0);
    // Compare against the roughest interior column, not the average: a tile
    // whose seam merely beats the mean would still show a line.
    let worst = 0;
    for (let x = 1; x < tile.width - 1; x += 7) worst = Math.max(worst, columnGap(tile, x, x + 1));
    assert.ok(
      seam <= worst,
      `${name} seams: wrap gap ${seam.toFixed(2)} exceeds the roughest interior column ${worst.toFixed(2)}`
    );
  }
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
  // A 2x render must be the same wood at finer sampling. If it is not, the
  // committed tile stops matching the profile it claims to come from.
  const one = renderLayer(rings, 32, 16, 1);
  const two = renderLayer(rings, 32, 16, 2);
  assert.equal(two.w, 64);
  // Pixel centres differ between the two grids, so compare the mean alpha.
  const mean = (r) => {
    let s = 0;
    for (let i = 3; i < r.data.length; i += 4) s += r.data[i];
    return s / (r.data.length / 4);
  };
  assert.ok(
    Math.abs(mean(one) - mean(two)) < 0.05,
    "the ring field shifted when only the scale changed"
  );
});

test("a ring layer actually bands, rather than averaging to a wash", () => {
  // The failure this catches is a ring frequency so high it aliases into flat
  // grey, which looks like "no rings" but bakes without complaint.
  const r = renderLayer(rings, 512, 56, 1);
  let min = 1;
  let max = 0;
  for (let i = 3; i < r.data.length; i += 4) {
    min = Math.min(min, r.data[i]);
    max = Math.max(max, r.data[i]);
  }
  assert.ok(
    max - min > 0.3,
    `ring alpha spans only ${(max - min).toFixed(3)}; the rings have washed out`
  );
});

test("the committed profiles are valid and name their real output sizes", async () => {
  const profiles = await loadProfiles();
  assert.deepEqual([...profiles.keys()].sort(), ["grain-back", "grain-h", "grain-v"]);
  // The CSS paints each tile at its natural size, so a profile that disagrees
  // with background-size in shelf-themes.css tiles at the wrong pitch.
  assert.deepEqual(profiles.get("grain-h").tile, { width: 512, height: 56 });
  assert.deepEqual(profiles.get("grain-v").tile, { width: 56, height: 512 });
  assert.deepEqual(profiles.get("grain-back").tile, { width: 384, height: 512 });
});
