// Grain running down an upright: the two stiles, and the side walls of every
// bay. Same timber as grain-h with both axes swapped, because a board's grain
// follows its length and these boards stand up.
//
// A stile is 25px wide (12 below `sm`), so this tile is seen as a narrow
// vertical strip. Only the leftmost columns are ever painted.
export default {
  tile: { width: 56, height: 512 },
  scale: 2,
  quality: 92,

  layers: [
    {
      type: "noise",
      color: "#8a6339",
      gain: 0.55,
      offset: -0.22,
      baseFrequency: [0.006, 0.003],
      octaves: 2,
      seed: 5,
    },
    {
      // `along: "y"` swaps which axis carries the drift, so the arches sweep
      // down the upright instead of across it. The frequency pairs swap with
      // it; everything else is identical to grain-h on purpose, because these
      // are meant to read as boards cut from the same tree.
      type: "rings",
      color: "#26150a",
      gain: 0.6,
      offset: 0.06,
      along: "y",
      seed: 17,
      ringFrequency: 0.24,
      latewood: 0.3,
      pith: 17,
      drift: 22,
      driftFrequency: [0.0006, 0.006],
      jitter: 2,
      jitterFrequency: [0.55, 0.035],
    },
    {
      type: "noise",
      color: "#1f1108",
      gain: 0.85,
      offset: -0.44,
      baseFrequency: [0.7, 0.006],
      octaves: 3,
      seed: 13,
    },
    {
      type: "noise",
      color: "#170c05",
      gain: 5,
      offset: -3.45,
      baseFrequency: [0.75, 0.26],
      octaves: 1,
      seed: 41,
    },
  ],
};
