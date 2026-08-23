import { test } from "node:test";
import assert from "node:assert/strict";
import { insetsFrom, type Band } from "./keyboardBand.ts";

// Run with `npm test`. No browser and no dependencies: node --test runs this
// TypeScript directly.
//
// This bug came back five times, and the reason it survived a test suite is in
// the helper below rather than in any single case. The suite this replaced
// measured where the dialog sat in LAYOUT coordinates, and a rule that holds
// the band's offset back looks perfectly still in those: the layout viewport
// has not moved, only the window onto it has. On the screen, which is the only
// place a person can see the dialog, the same readings are 42px apart. Every
// assertion here is therefore in screen coordinates.

const LAYOUT = 844;

/** Where ModalFrame's `place-items-center` lands a panel, ON SCREEN.
 *
 *  The frame is `fixed inset-0`, so it spans the layout viewport and its
 *  padding centres the panel in what the insets leave. Subtracting the band's
 *  own offset converts that to what the eye sees, because the visible band
 *  starts `offsetTop` down the layout viewport. */
function screenCentre(band: Band | null, layout = LAYOUT): number {
  const { top, bottom } = insetsFrom(band, layout);
  const layoutCentre = top + (layout - top - bottom) / 2;
  return layoutCentre - (band?.offsetTop ?? 0);
}

// --- insetsFrom -------------------------------------------------------------

test("no band means nothing is hidden", () => {
  assert.deepEqual(insetsFrom(null, LAYOUT), { top: 0, bottom: 0 });
});

test("a full-height band hides nothing", () => {
  assert.deepEqual(insetsFrom({ offsetTop: 0, height: LAYOUT }, LAYOUT), { top: 0, bottom: 0 });
});

test("a band the layout viewport outlives is reported as the bottom strip", () => {
  assert.deepEqual(insetsFrom({ offsetTop: 0, height: 480 }, LAYOUT), { top: 0, bottom: 364 });
});

test("a slid band is reported as the top strip", () => {
  assert.deepEqual(insetsFrom({ offsetTop: 110, height: 480 }, LAYOUT), { top: 110, bottom: 254 });
});

test("insets are whole pixels even when the band is not", () => {
  const { top, bottom } = insetsFrom({ offsetTop: 110.37, height: 480.42 }, LAYOUT);
  assert.ok(Number.isInteger(top) && Number.isInteger(bottom));
});

test("a band taller than the layout viewport never reports a negative strip", () => {
  const { top, bottom } = insetsFrom({ offsetTop: 110, height: LAYOUT }, LAYOUT);
  assert.ok(bottom >= 0 && top >= 0);
});

// --- the capture this was fixed against --------------------------------------
//
// Recorded on the device, opening a game's card and tapping the System field.
// iOS shrinks the LAYOUT viewport for the keyboard (733 -> 471) and then slides
// the band 42px down inside what is left, in that order, a frame or two apart.

const RESTING: Band = { offsetTop: 0, height: 733 };
const KEYBOARD_ARRIVES: Band = { offsetTop: 0, height: 429 };
const BAND_SLIDES: Band = { offsetTop: 42, height: 429 };
const KEYBOARD_LAYOUT = 471;

test("the recorded resting card is where the model says", () => {
  // The recorder saw top 108, height 518, so its centre was 367.
  assert.equal(screenCentre(RESTING, 733), 366.5);
});

test("the recorded keyboard-up card is where the model says", () => {
  // The recorder saw top 12, height 405, so its centre was 214.5.
  assert.equal(screenCentre(BAND_SLIDES, KEYBOARD_LAYOUT), 214.5);
});

test("the band sliding after the keyboard does not move the dialog on screen", () => {
  // The two readings arrive a frame or two apart and describe the same picture:
  // the window onto the layout viewport moved, and the dialog moved with it.
  // Believing the second one immediately is what makes the card sit still.
  assert.equal(
    screenCentre(KEYBOARD_ARRIVES, KEYBOARD_LAYOUT),
    screenCentre(BAND_SLIDES, KEYBOARD_LAYOUT)
  );
});

test("ignoring a slide is worth exactly the jump that was reported", () => {
  // What the five earlier attempts did: hold the last settled offset (0) for
  // 400ms and correct at the settle. This is the size of the wrongness, and it
  // matches the recorder's card top going 12 -> -30 -> 12.
  const held = insetsFrom({ offsetTop: 0, height: BAND_SLIDES.height }, KEYBOARD_LAYOUT);
  const heldCentre =
    held.top + (KEYBOARD_LAYOUT - held.top - held.bottom) / 2 - BAND_SLIDES.offsetTop;
  assert.equal(screenCentre(BAND_SLIDES, KEYBOARD_LAYOUT) - heldCentre, 42);
});

// --- the property, over every burst -----------------------------------------

test("a dialog only ever moves as far as the band it is following", () => {
  // The rule is stateless, so the guarantee is not "it settles correctly"
  // (nothing is deferred, so it always does) but that no reading can put the
  // dialog somewhere the band does not: outside the visible band, or overlapping
  // the keyboard. That is what a person means by the card being in the wrong
  // place, and it holds for a band of any size at any offset.
  let seed = 20260823;
  const r = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  for (let i = 0; i < 4000; i++) {
    // A layout viewport that may or may not have shrunk with the keyboard, and
    // a band somewhere inside it: iOS 26 shrinks it, older iOS does not.
    const layout = 400 + Math.floor(r() * 500);
    const height = 200 + Math.floor(r() * (layout - 200));
    const offsetTop = Math.floor(r() * (layout - height + 1));
    const band = { offsetTop, height };
    const { top, bottom } = insetsFrom(band, layout);
    const context = `layout ${layout} band ${JSON.stringify(band)}`;

    // The padding box the dialog centres in is exactly the visible band.
    assert.equal(top, offsetTop, context);
    assert.equal(layout - top - bottom, height, context);

    // And its centre is the centre of what the user can see.
    assert.equal(screenCentre(band, layout), height / 2, context);
  }
});
