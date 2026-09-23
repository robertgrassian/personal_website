// The back panel of a bay: the same timber, seen in the shadow the shelf above
// casts on it.
//
// This is the one LARGE surface in the case, and the only place with room to
// show figure rather than a few lines. So it gets the broad cathedral arches
// the boards cannot fit, at roughly a third of their ring frequency.
//
// It is also the darkest. CSS lays a 47-80% black wash over this tile and then
// stands the game covers in front of it, which is why it bakes at 1.5x rather
// than 2x and carries one pore layer instead of two: past that the detail is
// paid for and never seen.
export default {
  tile: { width: 384, height: 512 },
  scale: 1.5,
  quality: 85,

  layers: [
    {
      type: "noise",
      color: "#8a6339",
      gain: 0.45,
      offset: -0.2,
      baseFrequency: [0.02, 0.002],
      octaves: 2,
      seed: 5,
    },
    {
      // A different seed from the boards, so the panel is visibly a different
      // piece of timber rather than the same board stretched.
      //
      // pith is low and drift is high: that combination is what produces the
      // big nested arches. It is the flatsawn look the boards are too narrow to
      // show, and putting it here is the whole reason the panel is worth
      // drawing at all.
      type: "rings",
      color: "#26150a",
      gain: 0.7,
      offset: 0.06,
      along: "y",
      seed: 23,
      ringFrequency: 0.105,
      latewood: 0.34,
      pith: 44,
      drift: 110,
      driftFrequency: [0.0016, 0.004],
      jitter: 4.5,
      jitterFrequency: [0.3, 0.02],
    },
    {
      type: "noise",
      color: "#1f1108",
      gain: 0.7,
      offset: -0.4,
      baseFrequency: [0.22, 0.004],
      octaves: 3,
      seed: 13,
    },
    {
      type: "noise",
      color: "#170c05",
      gain: 4.4,
      offset: -3.05,
      baseFrequency: [0.55, 0.1],
      octaves: 1,
      seed: 41,
    },
  ],
};
