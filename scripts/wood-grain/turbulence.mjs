// A port of the SVG 1.1 feTurbulence reference implementation, including the
// tile stitching that librsvg does not implement.
//
// Why this exists: the grain has to TILE. Rendering the source SVGs with
// librsvg (via sharp) produced tiles whose last column had nothing to do with
// their first, so every repeat showed a hard line. Measured at ~26x the
// discontinuity of an interior column. Chrome honours stitchTiles and librsvg
// ignores it, so the only way to bake what Chrome draws is to generate it.
//
// The algorithm is verbatim from the spec so the output matches a browser's.
// Do not "tidy" the integer arithmetic or the shuffle: the RNG sequence is
// part of the result, and any change to it re-rolls the entire texture.

const RAND_m = 2147483647; // 2**31 - 1
const RAND_a = 16807; // 7**5, a primitive root of m
const RAND_q = 127773; // m / a
const RAND_r = 2836; // m % a

const BSize = 0x100;
const BM = 0xff;
const PerlinN = 0x1000;

function setupSeed(seed) {
  if (seed <= 0) seed = -(seed % (RAND_m - 1)) + 1;
  if (seed > RAND_m - 1) seed = RAND_m - 1;
  return seed;
}

function nextRandom(seed) {
  let result = RAND_a * (seed % RAND_q) - RAND_r * Math.floor(seed / RAND_q);
  if (result <= 0) result += RAND_m;
  return result;
}

function buildLattice(seed) {
  const lattice = new Int32Array(BSize + BSize + 2);
  // [channel][index][x|y]
  const gradient = Array.from({ length: 4 }, () =>
    Array.from({ length: BSize + BSize + 2 }, () => [0, 0])
  );

  let s = setupSeed(seed);
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < BSize; i++) {
      lattice[i] = i;
      for (let j = 0; j < 2; j++) {
        s = nextRandom(s);
        gradient[k][i][j] = ((s % (BSize + BSize)) - BSize) / BSize;
      }
      const len = Math.sqrt(
        gradient[k][i][0] * gradient[k][i][0] + gradient[k][i][1] * gradient[k][i][1]
      );
      gradient[k][i][0] /= len;
      gradient[k][i][1] /= len;
    }
  }

  // Shuffle. `i` enters this loop at BSize, exactly as in the spec.
  let i = BSize;
  while (--i) {
    const k = lattice[i];
    s = nextRandom(s);
    const j = s % BSize;
    lattice[i] = lattice[j];
    lattice[j] = k;
  }

  // Duplicate the table so lookups can run past the end without wrapping.
  for (let n = 0; n < BSize + 2; n++) {
    lattice[BSize + n] = lattice[n];
    for (let k = 0; k < 4; k++) {
      gradient[k][BSize + n][0] = gradient[k][n][0];
      gradient[k][BSize + n][1] = gradient[k][n][1];
    }
  }
  return { lattice, gradient };
}

const sCurve = (t) => t * t * (3 - 2 * t);
const lerp = (t, a, b) => a + t * (b - a);

function noise2(ctx, channel, vx, vy, stitch) {
  const { lattice, gradient } = ctx;
  let t = vx + PerlinN;
  let bx0 = Math.floor(t);
  let bx1 = bx0 + 1;
  const rx0 = t - Math.floor(t);
  const rx1 = rx0 - 1;
  t = vy + PerlinN;
  let by0 = Math.floor(t);
  let by1 = by0 + 1;
  const ry0 = t - Math.floor(t);
  const ry1 = ry0 - 1;

  // This block is the whole of stitching: lattice coordinates past the tile
  // edge are pulled back to where the tile started, so the far edge samples
  // the same gradients the near edge did.
  if (stitch !== null) {
    if (bx0 >= stitch.wrapX) bx0 -= stitch.width;
    if (bx1 >= stitch.wrapX) bx1 -= stitch.width;
    if (by0 >= stitch.wrapY) by0 -= stitch.height;
    if (by1 >= stitch.wrapY) by1 -= stitch.height;
  }

  bx0 &= BM;
  bx1 &= BM;
  by0 &= BM;
  by1 &= BM;

  const i = lattice[bx0];
  const j = lattice[bx1];
  const b00 = lattice[i + by0];
  const b10 = lattice[j + by0];
  const b01 = lattice[i + by1];
  const b11 = lattice[j + by1];

  const sx = sCurve(rx0);
  const sy = sCurve(ry0);
  const g = gradient[channel];

  let q = g[b00];
  const u0 = rx0 * q[0] + ry0 * q[1];
  q = g[b10];
  const v0 = rx1 * q[0] + ry0 * q[1];
  const a = lerp(sx, u0, v0);

  q = g[b01];
  const u1 = rx0 * q[0] + ry1 * q[1];
  q = g[b11];
  const v1 = rx1 * q[0] + ry1 * q[1];
  const b = lerp(sx, u1, v1);

  return lerp(sy, a, b);
}

/**
 * @param fractal true for type="fractalNoise", false for "turbulence".
 * Tile is the filter region, in user units, anchored at 0,0.
 */
export function turbulence(ctx, channel, x, y, opts) {
  const { fractal, octaves, stitchTiles, tileWidth, tileHeight } = opts;
  let freqX = opts.baseFreqX;
  let freqY = opts.baseFreqY;
  let stitch = null;

  if (stitchTiles) {
    // Snap each frequency to the nearest one that fits a whole number of
    // periods across the tile. Without this the field cannot be periodic and
    // no amount of lattice wrapping saves the edge.
    if (freqX !== 0) {
      const lo = Math.floor(tileWidth * freqX) / tileWidth;
      const hi = Math.ceil(tileWidth * freqX) / tileWidth;
      freqX = freqX / lo < hi / freqX ? lo : hi;
    }
    if (freqY !== 0) {
      const lo = Math.floor(tileHeight * freqY) / tileHeight;
      const hi = Math.ceil(tileHeight * freqY) / tileHeight;
      freqY = freqY / lo < hi / freqY ? lo : hi;
    }
    stitch = {
      width: Math.floor(tileWidth * freqX + 0.5),
      height: Math.floor(tileHeight * freqY + 0.5),
      wrapX: 0,
      wrapY: 0,
    };
    stitch.wrapX = 0 * freqX + PerlinN + stitch.width;
    stitch.wrapY = 0 * freqY + PerlinN + stitch.height;
  }

  let sum = 0;
  let vx = x * freqX;
  let vy = y * freqY;
  let ratio = 1;

  for (let octave = 0; octave < octaves; octave++) {
    const n = noise2(ctx, channel, vx, vy, stitch);
    sum += (fractal ? n : Math.abs(n)) / ratio;
    vx *= 2;
    vy *= 2;
    ratio *= 2;
    if (stitch !== null) {
      stitch.width *= 2;
      stitch.wrapX = 2 * stitch.wrapX - PerlinN;
      stitch.height *= 2;
      stitch.wrapY = 2 * stitch.wrapY - PerlinN;
    }
  }
  // fractalNoise is signed and gets remapped into [0,1]; turbulence is already
  // non-negative.
  return fractal ? (sum + 1) / 2 : sum;
}

export { buildLattice };
