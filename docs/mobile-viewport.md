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

`src/components/dev/ViewportRecorder.tsx` is the recorder built for this. See
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

`overflow: hidden` does **not** reliably stop a finger. This doc said it did
until 2026-08-31, on the strength of captures that all had a keyboard in them
and so had reached stage two; reported from a phone, the shelves still scrolled
behind an open detail card, and behind one flying home, which made it land on a
case that had moved and snap into place as it went. Stage one therefore also
cancels the touch itself: a non-passive `touchmove` listener on the document
that calls `preventDefault()`, installed for as long as the lock is held.

It cancels only gestures the dialog is not scrolling itself. The decision is
made once per gesture, at `touchstart`, by walking out from the touch target to
the body and looking for a region that is `overflow-y: auto`/`scroll` **and has
something to scroll right now**: an empty scroller would otherwise eat the
gesture, and a scroller that runs out mid-gesture cannot be taken back by any
listener, which is why every scroller inside a locked surface also needs
`overscroll-behavior: contain`. Two fingers are always let through, so a dialog
never blocks pinch-zoom. `handlesOwnScroll` in `scrollLock.ts` is that
decision, kept free of the DOM so `scrollLock.test.ts` can replay a chain.

Not covered, and worth suspecting if the symptom comes back: momentum already in
flight when the dialog opens. `preventDefault` reaches the next touch, not a
glide the compositor is already running.

`overflow: hidden` does not stop WebKit scrolling the
document to "reveal" a focused field — 206px, measured — and when that field is
inside a `position: fixed` dialog the scroll reveals nothing at all. What it
moves is the page behind the dialog, which rises and stays risen.

`scrollLock.ts` therefore takes the body out of flow
(`position: fixed; top: -scrollY`), which removes the scroll range the reveal
needs. It does that in **two stages**, and the split is load-bearing: opening a
dialog only sets `overflow: hidden`, and the body comes out of flow later, when
a field actually takes focus.

The reason is Safari's URL bar. It stays collapsed to a pill only while the page
is scrollable and scrolled, so a page that cannot scroll gets the full bar back
and the screen shrinks — on every dialog open, including the great majority that
never touch a keyboard. Deferring stage two puts that cost only where a keyboard
is arriving to cover the bottom of the screen anyway. `useModalChrome` triggers
it from `focusin`, filtered to elements that actually raise a keyboard: a dialog
focuses something the moment it opens, and checkboxes and radios raise nothing.

**It fires on the click that focus belongs to, not on the focus.** A touch
focuses a field between its own `pointerdown` and its `click`, and re-laying out
the document there means WebKit never delivers that click: tapping a suggestion
field focused it but never opened its list, and it took a second tap. A timeout
covers a focus that never gets a click (Tab, or a programmatic one). Because of
that gap, stage two goes out of flow at the position recorded by stage ONE, so a
reveal scroll that happens in between is undone rather than frozen in.

Three more things are load-bearing:

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

**The page is a moving target too, on purpose.** The card releases the scroll
lock when its return flight starts (`scrollLocked` on `ModalFrame`), so the
shelves can be scrolled while it flies home. The flight is a transform between
two viewport positions, so it stays correct as long as both ends move together:
the pinned box tracks the page through the `translate` property, which applies
before `transform` and so composes with the animation instead of replacing it.
Scroll far enough during a close and the card leaves the screen with the shelf it
was landing on.

**Track it from a scroll timeline, not from frames.** Reading `scrollY` in a
`requestAnimationFrame` and writing the offset back is a main-thread reaction to
a scroll the compositor has already painted, so the card lands a frame behind
the shelf: measured against a fast flick that is around 30px, and it reads as
the card shaking loose. It was the first thing tried here and it was visibly
jumpy on the device. A scroll timeline (`new ScrollTimeline({ source })`, passed
to `element.animate`) instead states `translate` as a function of scroll offset
over the document's whole scroll range, and the compositor evaluates it in the
same frame it scrolls.

The per-frame path is still there for two cases. Firefox has no scroll timeline
yet, so it keeps it outright. And the range the keyframes are written over
cannot be measured while the lock is in stage two: the body is out of flow, so
`scrollHeight` is the viewport's and every keyframe would collapse onto one
value. A close with a keyboard up is in exactly that state, because the lock is
released a paint later than the flight is measured, so those flights run on
frames until `pageOutOfFlow()` goes false and then hand over. Every other close
starts on the timeline in the layout effect itself, tracked from its first
painted frame.

Pinning in document coordinates instead would make that automatic, and does not
work: the card sits inside `ModalFrame`, which is `position: fixed`, so an
absolutely positioned child is placed against the frame rather than the
document.

**Pin the size too, and unclamp it first.** A keyboard clamps a dialog to what
fits above it (365px against a resting 518px), and a FLIP flight that scales by
width alone will then fly it home at two thirds of its proper height — a case
cropped top and bottom. Dropping the clamp before measuring is what makes every
close land on the same proportions.

Stage two makes `ModalBackdrop` an absolutely positioned descendant of a fixed
`<body>`, and that component is `position: absolute` in document space precisely
because WebKit clips fixed layers. **Checked on the device: the backdrop still
dims to the bottom edge**, so the clip does not apply through this arrangement.

## The scroll position lies too

Not only the viewport. The sticky library header hides on scroll down, and
`useHideOnScrollDown` decided that from `window.scrollY` alone, on the unstated
assumption that it only ever moves the way the finger did. It does not: a
toolbar sliding in resizes the viewport, and the browser then moves the document
to pay for the space it took. Those pixels arrive as ordinary scroll events
pointing against the finger, over the following frames, and they hid the bar in
the middle of a fast scroll up.

Three things that took a device to learn, all now in `hideOnScroll.ts`:

- **The toolbar is the better signal.** It answers the same reach-up gesture the
  header does, using velocity JavaScript cannot see, and it publishes the answer
  by resizing the viewport. Reading that beats re-deriving intent from deltas.
- **Suppress with a budget, not a timer.** A timer bans every instance of the
  decision for its duration. Half a second of "will not hide" was instantly
  obvious on the device. A budget is denominated in the pixels it distrusts, so
  a real gesture spends it and carries on.
- **Anything that resets accumulated state must be gated on direction.** The
  branch that shows the bar also clears its anchor and its descending run.
  Reached by a stray one-pixel resize during a scroll down, it restarted the
  hide every time it fired, which reads as the bar refusing to leave.

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
2. On the phone, open any page with **`?debug`**.
3. Do the thing that misbehaves. Each burst auto-sends when the page has been
   still for 1.5s, and prints in the terminal running the server. A `rec N`
   button top-left opens a live table and manual send buttons.

Columns: `top`/`h` are the dialog's box, `anchor` is a shelf case (i.e. where
the page is), `offTop`/`band`/`layout` are the two viewports, `scrollY` is the
document. Reading them together is the whole point — the same visible symptom
has a different cause in each column.

With no dialog open, `top`/`h` fall back to the sticky library header, so the
same capture covers its hide-on-scroll. A header that genuinely changed its mind
slides the full height and back over several frames; a paint artifact does not
move `top` at all.

`?debug` also makes the viewer the library's owner, so the owner-only fields
(which is where the keyboard lives) can be reached from a device that cannot
sign in: local Supabase listens on `127.0.0.1`, so no sign-in of any kind
completes from another machine. It is UI gating only. Reads and writes still go
out unauthenticated, so saving anything will fail.

That override also works on **preview deploys**, but only on the site owner's own
library (`/video-games`, and `/video-games/u/rgrassian`), so a preview link shared
with someone never dresses up their shelf with another account's controls. Saving
still fails there, for a different reason: a preview points at production's API,
so `meApi.ts` refuses every write before sending it. The gate requires that
refusal to be armed, so a preview given its own writable `LIBRARY_API_ORIGIN`
gets no override at all. The viewport recorder stays local-only regardless:
`layout.tsx` does not mount it on a deploy, and `/api/dev/viewport-log` 404s
there as a second line of defense.

Whether `?debug` is allowed is decided in a Server Component and passed down
(`src/lib/debugMode.ts` says why): neither `process.env.VERCEL` nor `VERCEL_ENV`
is inlined into client bundles, so a client-side check would read `undefined` and
enable it in production.
