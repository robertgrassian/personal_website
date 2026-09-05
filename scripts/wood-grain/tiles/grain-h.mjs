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
      // is set from the board, not from a photo: at 0.3 the pitch is ~3.3px, so
      // a 14px board carries four lines. The 15px pitch that looks right on a
      // large swatch gives each board one fat wobble, and the case reads as a
      // cartoon.
      type: "rings",
      color: "#26150a",
      gain: 0.6,
      offset: 0.06,
      along: "x",
      seed: 17,
      ringFrequency: 0.3,
      latewood: 0.3,
      center: 0.5,
      // pith and drift are in the tile's own user units. drift is what makes
      // the rings arch; keep it below pith or d passes through zero and the
      // arches close into rings around a knot.
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
