// Grain running along a board's length: the shelf boards, the crown, the
// plinth and the floor of every bay.
//
// Read the sizes off the furniture before touching a number here. A board is
// 14px tall, the crown 17, the plinth 19, and CSS paints this tile at its
// natural 512x56 with no vertical offset -- so only the TOP ~19 rows are ever
// seen on any piece. Detail below that row is paid for and invisible.
export default {
  tile: { width: 512, height: 56 },
  // 2x because a retina display would otherwise upscale the fibre into mush.
  scale: 2,
  quality: 92,

  layers: [
    {
      // Broad colour drift across the board, so the timber is not one flat
      // value before anything is drawn on it.
      type: "noise",
      color: "#8a6339",
      gain: 0.55,
      offset: -0.22,
      baseFrequency: [0.003, 0.006],
      octaves: 2,
      seed: 5,
    },
    {
      // The growth rings. ringFrequency is the number that matters most and it
      // is set from the board, not from a photo: at 0.24 the pitch is ~4.2px, so
      // a 14px board carries about three lines.
      //
      // The usable window is narrow at this size. A 15px pitch gives each board
      // one fat wobble and the case reads as a cartoon; past ~0.45 the lines
      // land within a pixel or two of each other and degenerate into speckle
      // that looks like dirt rather than grain. 0.30 shipped first and was
      // busy; the low 0.2s read as a plank.
      //
      // Within that window the exact value still matters, for a reason that is
      // not visual: it decides where a ring's steep trailing edge falls
      // relative to the tile boundary. Land one on the edge and the tiny
      // difference between the two sides is amplified into a seam -- 0.22 and
      // 0.25 both trip the wrap test at ~1.3x a normal interior line, while
      // 0.24 sits at 0.95x and looks identical. Re-run the tests after moving
      // this, and pick a neighbouring value rather than relaxing them.
      type: "rings",
      color: "#26150a",
      gain: 0.6,
      offset: 0.06,
      along: "x",
      seed: 17,
      ringFrequency: 0.24,
      latewood: 0.3,
      // pith and drift are in the tile's own user units, and drift is what
      // makes the rings arch. What matters is the realised range of d, not
      // drift's nominal size: the noise is (sum+1)/2 and never reaches 0 or 1,
      // so d here stays in 13.4-21.8 despite drift exceeding pith. Push it far
      // enough that d approaches zero and the arches close into knots.
      pith: 17,
      drift: 22,
      driftFrequency: [0.006, 0.0006],
      jitter: 2,
      jitterFrequency: [0.035, 0.55],
    },
    {
      // Fibre, much finer than the rings and much fainter. Without it the ring
      // lines sit on flat colour and the whole thing reads as vector art.
      type: "noise",
      color: "#1f1108",
      gain: 0.85,
      offset: -0.44,
      baseFrequency: [0.006, 0.7],
      octaves: 3,
      seed: 13,
    },
    {
      // Pores. One octave on purpose: more would soften the edges, and a pore
      // is a hole, not a smudge. The steep gain against a large negative offset
      // is a threshold, which is what turns smooth noise into scattered dashes.
      type: "noise",
      color: "#170c05",
      gain: 5,
      offset: -3.45,
      baseFrequency: [0.26, 0.75],
      octaves: 1,
      seed: 41,
    },
  ],
};
