import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBandTracker,
  insetsFrom,
  type Band,
  type VisibleViewportInsets,
} from "./keyboardBand.ts";

// Run with `npm test`. No browser and no dependencies: node --test runs this
// TypeScript directly.
//
// This bug has come back four times, each fix correct about the sequence it was
// written against and blind to one it was not, so what is checked here is not a
// list of expected numbers but the properties that make the dialog look right:
// it ends where the band says, and it does not visibly change its mind on the
// way. Randomised bursts at the bottom are what catch the ordering nobody
// thought of; the named cases above them are the ones that actually shipped.

const LAYOUT = 844;

// Where ModalFrame's `place-items-center` lands a panel inside its padding box.
// Movement in this number is exactly the movement a person sees.
function centre(insets: VisibleViewportInsets, layout = LAYOUT): number {
  return insets.top + (layout - insets.top - insets.bottom) / 2;
}

/** One event in a burst: the band it reports, and the gap before the next. */
type Step = { band: Band; gapMs: number };

const BURST_END_MS = 400; // must match useVisibleViewportInsets

/** Replay a burst the way the hook does and collect the positions rendered.
 *
 *  The hook calls `moving` on a frame after each event and `settled` once the
 *  viewport has been quiet for BURST_END_MS, then drops any reading identical
 *  to the last. Doing exactly that here needs no clock: a gap at least as long
 *  as the burst window is a settle, and so is the end of the sequence. */
function replay(steps: Step[], startBand?: Band, layout = LAYOUT): number[] {
  const start: Band = startBand ?? { offsetTop: 0, height: layout };
  const tracker = createBandTracker(start.offsetTop, start.height);
  let last = insetsFrom(start, null, layout);
  const seen = [centre(last, layout)];

  const record = (next: VisibleViewportInsets) => {
    if (next.top === last.top && next.bottom === last.bottom) return;
    last = next;
    seen.push(centre(next, layout));
  };

  steps.forEach(({ band, gapMs }, i) => {
    record(tracker.moving(band, layout));
    if (gapMs >= BURST_END_MS || i === steps.length - 1) record(tracker.settled(band, layout));
  });
  return seen;
}

const step = (height: number, offsetTop: number, gapMs = 100): Step => ({
  band: { offsetTop, height },
  gapMs,
});

/** Direction changes in the rendered positions. Zero means it never visibly
 *  changed its mind, which is the whole point.
 *
 *  Anything under a pixel is not a direction change. Insets are whole pixels
 *  and the centre halves them, so a band of odd height cannot land exactly on
 *  the resting position and settling onto it moves half a pixel. That is
 *  arithmetic, not a wobble. */
const VISIBLE_PX = 1;

function reversals(seen: number[]): number {
  const dirs = seen
    .slice(1)
    .map((c, i) => (Math.abs(c - seen[i]) < VISIBLE_PX ? 0 : Math.sign(c - seen[i])))
    .filter((d) => d !== 0);
  return dirs.filter((d, i) => i > 0 && d !== dirs[i - 1]).length;
}

// --- insetsFrom -------------------------------------------------------------

test("no band means nothing is hidden", () => {
  assert.deepEqual(insetsFrom(null, null, LAYOUT), { top: 0, bottom: 0 });
});

test("a full-height band hides nothing", () => {
  assert.deepEqual(insetsFrom({ offsetTop: 0, height: LAYOUT }, null, LAYOUT), {
    top: 0,
    bottom: 0,
  });
});

test("a keyboard is reported as the bottom strip", () => {
  assert.deepEqual(insetsFrom({ offsetTop: 0, height: 480 }, null, LAYOUT), {
    top: 0,
    bottom: 364,
  });
});

test("a measured slide is believed, however far down it puts the dialog", () => {
  assert.deepEqual(insetsFrom({ offsetTop: 110, height: 480 }, null, LAYOUT), {
    top: 110,
    bottom: 254,
  });
  // A band that is both tall and slid genuinely does sit below rest, and the
  // cap must not apply, because this one is measured rather than guessed.
  const low = insetsFrom({ offsetTop: 110, height: LAYOUT }, null, LAYOUT);
  assert.ok(
    centre(low) > LAYOUT / 2,
    `a genuinely low band belongs below rest, got ${centre(low)}`
  );
});

test("a guessed slide is capped at the resting position", () => {
  // The close-burst bug: a slide remembered from the open, still held while the
  // band grows back, used to ride the dialog below where it rests.
  const insets = insetsFrom({ offsetTop: 0, height: 745 }, 65, LAYOUT);
  assert.ok(centre(insets) <= LAYOUT / 2, `centre ${centre(insets)} must not exceed ${LAYOUT / 2}`);
});

test("a guessed slide floors, so an exact half cannot cross the cap", () => {
  // (844 - 745) / 2 is 49.5; rounding to nearest gave 50 and dipped a pixel.
  assert.equal(insetsFrom({ offsetTop: 0, height: 745 }, 999, LAYOUT).top, 49);
});

test("insets are whole pixels even when the band is not", () => {
  const { top, bottom } = insetsFrom({ offsetTop: 110.37, height: 480.42 }, null, LAYOUT);
  assert.ok(Number.isInteger(top) && Number.isInteger(bottom));
});

test("a band taller than the layout viewport never reports a negative strip", () => {
  const { top, bottom } = insetsFrom({ offsetTop: 110, height: LAYOUT }, null, LAYOUT);
  assert.ok(bottom >= 0 && top >= 0);
});

// --- sequences that have actually shipped broken -----------------------------

test("resize before scroll moves once (was 422, 240, 350, 240)", () => {
  const seen = replay([step(480, 0, 260), step(480, 110, 260), step(480, 0)]);
  assert.deepEqual(seen, [422, 240]);
});

test("scroll before resize moves once (was 422, 477, 240)", () => {
  const seen = replay([step(LAYOUT, 110, 200), step(480, 110, 200), step(480, 0)]);
  assert.deepEqual(seen, [422, 240]);
});

test("dismissing while a slide is still remembered never dips below rest", () => {
  // Was 422, 274, 339, 388, 438, 422 — 438 is below the resting 422.
  const seen = replay([step(646, 0, 100), step(745, 0, 100), step(LAYOUT, 0)], {
    offsetTop: 65,
    height: 547,
  });
  assert.equal(reversals(seen), 0);
  assert.ok(Math.max(...seen.slice(1)) <= LAYOUT / 2, `dipped to ${Math.max(...seen.slice(1))}`);
});

test("a smoothly animating keyboard tracks every step", () => {
  const seen = replay([step(750, 0, 140), step(640, 0, 140), step(540, 0, 140), step(480, 0)]);
  assert.deepEqual(seen, [422, 375, 320, 270, 240]);
});

test("a slide that never springs back costs exactly one late correction", () => {
  const seen = replay([step(480, 0, 260), step(480, 110)]);
  assert.deepEqual(seen, [422, 240, 350]);
});

test("a slide that has settled is remembered into the next burst", () => {
  // Without this, nothing catches the tracker forgetting a settled slide: the
  // dialog jumps back up at the start of the next burst and corrects again.
  // The gap of 500 is what makes the first reading settle before the rest.
  const seen = replay([step(480, 110, 500), step(500, 110, 100), step(520, 110)]);
  assert.ok(reversals(seen) <= 1, `expected one correction at most, got ${JSON.stringify(seen)}`);
  // The band grows across these, and growth waits for the settle, so the
  // intermediate 360 this used to render is superseded by 520 before anything
  // is committed. Same start, same end, one fewer move.
  assert.deepEqual(seen, [422, 240, 350, 370]);
});

test("sub-pixel jitter is not a move", () => {
  const seen = replay([
    step(480.33, 0, 120),
    step(480.34, 0.004, 90),
    step(480.32, 0.008, 90),
    step(480.33, 0.002),
  ]);
  assert.deepEqual(seen, [422, 240]);
});

test("no keyboard means no movement", () => {
  assert.deepEqual(replay([step(LAYOUT, 0)]), [422]);
});

// --- the accessory bar -------------------------------------------------------

// iOS puts a suggestion pill above the keyboard and takes it away again on its
// own, after everything has settled. Each toggle is worth about this much band.
const PILL = 44;

test("the accessory bar coming and going moves nothing", () => {
  // The reported symptom, from a real capture: layout 667, band 365, offset 0.
  // Following the growth walked the card down half a pill and back up again.
  const layout = 667;
  const seen = replay(
    [step(365, 0, 600), step(365 + PILL, 0, 250), step(365, 0, 600)],
    { offsetTop: 0, height: layout },
    layout
  );
  assert.equal(reversals(seen), 0, `wobbled: ${JSON.stringify(seen)}`);
  assert.deepEqual(seen.map(Math.round), [334, 183]);
});

test("a pill that appears late and stays is followed, once", () => {
  const layout = 667;
  const seen = replay(
    [step(365 + PILL, 0, 600), step(365, 0, 600)],
    { offsetTop: 0, height: layout },
    layout
  );
  // Shrinking can hide the dialog, so it is followed: two moves, both upward.
  assert.equal(reversals(seen), 0, `wobbled: ${JSON.stringify(seen)}`);
  assert.deepEqual(seen.map(Math.round), [334, 205, 183]);
});

test("a band that grows is still believed once the viewport is quiet", () => {
  // Growth is deferred, not discarded: a dismissed keyboard must still land.
  const seen = replay([step(480, 0, 600), step(LAYOUT, 0, 600)]);
  assert.equal(seen[seen.length - 1], LAYOUT / 2);
});

// --- randomised bursts ------------------------------------------------------

function rng(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

/** A plausible keyboard opening. What varies is what nobody varied by hand:
 *  which event arrives first, how many animation steps there are, whether the
 *  band slides, whether it springs back, and how far apart the events fall. */
function randomOpen(r: () => number) {
  const kb = 260 + Math.floor(r() * 200);
  const end = LAYOUT - kb;
  const slide = r() < 0.6 ? 40 + Math.floor(r() * 120) : 0;
  const persists = slide > 0 && r() < 0.25;
  const stepCount = 1 + Math.floor(r() * 4);
  const gap = () => 20 + Math.floor(r() * 300);
  const scrollFirst = slide > 0 && r() < 0.5;

  const steps: Step[] = [];
  if (scrollFirst) steps.push(step(LAYOUT, slide, gap()));
  for (let i = 1; i <= stepCount; i++) {
    steps.push(step(Math.round(LAYOUT - (kb * i) / stepCount), scrollFirst ? slide : 0, gap()));
  }
  if (slide > 0 && !scrollFirst) steps.push(step(end, slide, gap()));
  if (slide > 0 && !persists) steps.push(step(end, 0, gap()));
  return { steps, startBand: undefined, finalSlide: persists ? slide : 0, finalHeight: end };
}

/** A dismissal, from a keyboard that may have settled with the band slid. */
function randomClose(r: () => number) {
  const kb = 260 + Math.floor(r() * 200);
  const from = LAYOUT - kb;
  const startSlide = r() < 0.4 ? 40 + Math.floor(r() * 120) : 0;
  const stepCount = 1 + Math.floor(r() * 3);
  const gap = () => 20 + Math.floor(r() * 300);
  const steps: Step[] = [];
  for (let i = 1; i <= stepCount; i++) {
    steps.push(step(Math.round(from + (kb * i) / stepCount), 0, gap()));
  }
  return {
    steps,
    startBand: { offsetTop: startSlide, height: from },
    finalSlide: 0,
    finalHeight: LAYOUT,
  };
}

test("randomised bursts never visibly change their mind", () => {
  const r = rng(20260823);
  for (let i = 0; i < 4000; i++) {
    const c = r() < 0.7 ? randomOpen(r) : randomClose(r);
    const seen = replay(c.steps, c.startBand);
    const context = () => `case ${i}: ${JSON.stringify(c.steps)} -> ${JSON.stringify(seen)}`;

    // Ends where the settled band says it should.
    const want = centre(
      insetsFrom({ offsetTop: c.finalSlide, height: c.finalHeight }, null, LAYOUT)
    );
    assert.equal(seen[seen.length - 1], want, context());

    if (c.finalSlide === 0) {
      // The behaviour actually seen on a device: the slide springs back, and
      // the dialog must go straight to its final spot.
      assert.equal(reversals(seen), 0, context());
    } else {
      // A slide that genuinely persists cannot be known until the viewport is
      // quiet, so one corrective move is allowed — but only one, and only last.
      assert.ok(reversals(seen) <= 1, context());
    }

    // No MOVE may put the dialog below its resting position: that is what "it
    // loads low, then pops up" looked like. seen[0] is exempt because it is the
    // settled state inherited from before this burst, and a band that really
    // had settled slid belongs below rest.
    if (c.finalSlide === 0 && seen.length > 1) {
      assert.ok(Math.max(...seen.slice(1)) <= LAYOUT / 2 + VISIBLE_PX, context());
    }
  }
});
