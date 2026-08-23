# Mobile viewports, keyboards and dialogs

What twelve captures from a real iPhone established, after the same family of
bugs was fixed wrong six times from theory. Read this before changing anything
about how a dialog positions itself, before adding a scroll lock, and before
believing anything in this area that has not been measured on a device.

## The one rule

**Measure on the device, in screen coordinates.** Every wrong fix here was
internally consistent and passed its tests. The suite that let five of them
through measured the dialog's position in _layout_ coordinates, where a rule
that holds the visual viewport's offset back looks perfectly still: the layout
viewport has not moved, only the window onto it has. On the screen the same two
readings were 42px apart. 4000 randomised bursts asserted "never visibly changes
its mind" while the card visibly changed its mind.

`src/components/dev/RectLogOverlay.tsx` is the recorder built for this. See
[Using the recorder](#using-the-recorder).

## Two viewports

- **Layout viewport** — what `position: fixed`, `inset-0`, `100vh` and `100dvh`
  resolve against. `document.documentElement.clientHeight`.
- **Visual viewport** — the band the user can actually see. `window.visualViewport`,
  giving `height` and `offsetTop` (how far down the layout viewport the band
  starts).

With no keyboard they coincide. With one, they do not, and **how** they diverge
is per browser, not per platform.

## Browsers disagree, on the same phone

All iOS browsers are WebKit underneath. They still do different things, so
"same engine" is not a safe prediction. Measured on one iPhone, opening a
keyboard for a field inside a dialog:

|         | layout viewport | `visualViewport.offsetTop` | model                       |
| ------- | --------------- | -------------------------- | --------------------------- |
| Firefox | 651 → **389**   | 0                          | shrinks the layout viewport |
| Safari  | 695, unchanged  | **209**                    | slides the visual viewport  |
| Chrome  | 665, unchanged  | **203**                    | slides the visual viewport  |

Code that assumes either model alone will be wrong on the other. The way to be
right on both is to derive the insets from whichever quantity moved, which is
what `keyboardBand.ts` does: `top = offsetTop`, `bottom = layout - top - band`.
In the shrink model the bottom strip comes out 0 and the top carries nothing; in
the slide model the top strip carries it all.

## Believe every reading

Five attempts held one half of the measurement back through a "burst", on the
theory that the browser's offset is a transient hunt for the focused field that
settles back to 0. **It does not.** Focusing a field moves the band to
`offsetTop 209` and it stays there for as long as the keyboard is up. Holding it
is not smoothing over a transient; it is being wrong for the length of the hold
and then correcting, which is the wobble those attempts were chasing.

There is no settle timer and no held state in the current code, and there should
not be one again without a capture that justifies it.

## Scroll locking

`overflow: hidden` stops a finger. It does **not** stop WebKit scrolling the
document to "reveal" a focused field — 206px, measured — and when that field is
inside a `position: fixed` dialog the scroll reveals nothing at all. What it
moves is the page behind the dialog, which rises and stays risen.

`scrollLock.ts` therefore takes the body out of flow
(`position: fixed; top: -scrollY`), which removes the scroll range the reveal
needs. Three things about it are load-bearing:

- **`window.scrollTo(0, 0)` in the same tick.** Until the document lays out
  again it is still scrolled, and the negative `top` counts a second time.
- **A depth counter in module state**, acting only on the transitions to and
  from 0. The surfaces that lock are not released in the order they were taken:
  `StatsPanel` and `FilterSheet` stay mounted and lock by flipping `enabled`, so
  an outer one can release while an inner dialog is still open.
- **`pageScrollY()` and `scrollPageTo()` instead of `window`.** A locked page has
  no scroll range, so `window.scrollY` reads 0 and `window.scrollTo` does
  nothing; scrolling means moving `top`. `useKeepResultsInView` is the caller
  that needs this, because on a phone filters are changed from inside
  `FilterSheet`, which holds the lock.

### Tried and rejected

- **`overflow: hidden` plus putting back any scroll that happens.** Cannot see
  the scroll it needs to undo. Safari and Chrome convert their visual-viewport
  slide into a real document scroll when the keyboard leaves, and that arrives
  as a `visualViewport` event, never as a window `scroll`. Result: the library
  ends up 209px high permanently and the card lands on a case that has moved.
  Subtracting `visualViewport.offsetTop` from `window.scrollY` correctly
  identifies a real document scroll, but there is no event to hang it on.
- **`interactiveWidget: "overlays-content"`** in the viewport meta. WebKit does
  not implement it; captures were identical with and without.

### Known cost

Safari renders **one frame** of the page displaced by the scroll position when a
dialog opens, because it reports a scroll it has not yet applied to layout, so
`top` and the document's own offset both count for that frame. `window.scrollY`
already reads 0 there, so no same-tick correction can reach it. Accepted against
the alternative, which was a permanently displaced library and a mis-aimed card
landing.

## Animating something out while the keyboard leaves

Closing a dialog blurs its field, so the keyboard leaves at the same moment the
exit animation starts. Both models move the dialog's box while it animates:
the shrink model regrows the `fixed inset-0` frame, the slide model returns
`offsetTop` to 0. An exit animation measured before that lands somewhere else.

`useCardFlight.ts` pins the card to a fixed px box at the instant the exit
begins. The layout viewport grows downward from an origin that does not move, so
a box in px cannot be re-centred by any of it.

**Pin the size too, and unclamp it first.** A keyboard clamps a dialog to what
fits above it (365px against a resting 518px), and a FLIP flight that scales by
width alone will then fly it home at two thirds of its proper height — a case
cropped top and bottom. Dropping the clamp before measuring is what makes every
close land on the same proportions.

## Open question

The lock makes `ModalBackdrop` an absolutely positioned descendant of a fixed
`<body>`, and that component is `position: absolute` in document space precisely
because WebKit clips fixed layers to a stale layout viewport and leaves an
undimmed strip at the bottom. Whether the clip applies through this arrangement
is **not verified**. To check: scroll until the URL bar collapses to the pill,
open any dialog, and look at the bottom strip.

## Not everything is fixable

Firefox visibly slides the whole page as the keyboard opens, and **nothing in
the document moves**: `offsetTop` 0, page anchor constant, `scrollY` 0. It is
the browser animating its own layout-viewport resize. There is no handle for
JavaScript. It is left alone deliberately; chasing it means fighting the browser
with exactly the machinery that produced the six earlier failures.

## Using the recorder

Available whenever the app runs locally, including a local production build
(`npm run build && npm start`), which matters because React StrictMode
double-mounts effects in dev and that is its own source of one-frame artifacts.
It is not built into any deploy.

1. Start the app so a phone on the same wifi can reach it — `npm run dev:full`
   prints a Network URL.
2. On the phone, open any page with **`?rectlog=1`**.
3. Do the thing that misbehaves. Each burst auto-sends when the page has been
   still for 1.5s, and prints in the terminal running the server. A `rect N`
   button top-left opens a live table and manual send buttons.

Columns: `top`/`h` are the dialog's box, `anchor` is a shelf case (i.e. where
the page is), `offTop`/`band`/`layout` are the two viewports, `scrollY` is the
document. Reading them together is the whole point — the same visible symptom
has a different cause in each column.

If you only have a signed-out device and need owner-only UI, the cheapest
bypass is a build-time constant in `FollowControls.tsx`'s two ownership hooks
driven by a gitignored `.env` variable. Local Supabase listens on `127.0.0.1`,
so no sign-in of any kind completes from another device.
