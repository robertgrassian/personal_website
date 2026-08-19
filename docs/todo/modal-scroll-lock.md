# Check whether the modal scroll lock holds on iOS Safari; on desktop it does.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

**Filed as a confirmed defect, disproven 2026-08-19.** The original report said
`useModalChrome`'s `document.body.style.overflow = "hidden"` never reaches the viewport, on the
evidence that `window.scrollBy(0, 500)` still moved the page with `StatsPanel` open.

_Why that test proves nothing._ `overflow: hidden` blocks **user** scrolling only. The box stays
programmatically scrollable by spec, so `scrollBy`, `scrollTo` and `scrollIntoView` all keep working
against a correctly locked viewport. Only `overflow: clip` refuses those too. A scroll lock has to
be tested with real input, not the scroll API.

_Re-verified against the running site_ (`/about`, Chromium 1194, viewport 900x700, a 4000px spacer
appended so the page scrolls). Computed `html` overflow is `visible` and `body` overflow is
`visible`, so the body value does propagate to the viewport here, and nothing in `globals.css` or
Tailwind preflight sets overflow on `html` to break that propagation:

| input                     | unlocked | `body { overflow: hidden }` |
| ------------------------- | -------- | --------------------------- |
| mouse wheel               | 400      | **0**                       |
| `End` key                 | 4313     | **0**                       |
| `window.scrollBy(0, 400)` | 4313     | 400                         |

Wheel and keyboard are locked. The third row is the original report reproducing itself, and is
correct behavior.

_What is actually still open._ iOS Safari is the platform where `body { overflow: hidden }` is known
not to stop touch scrolling, and it could not be tested here: only Chromium is installed, and
synthesized touch gestures do not reach the compositor in this headless setup (the unlocked control
does not scroll either, so the result is no signal rather than a pass). **Verify on a real iPhone
before writing any code.** Desktop needs nothing.

_The constraint if iOS does turn out to be broken._ Whatever replaces the current lock must restore
the scroll position on close rather than jumping the user to the top, which is the usual failure of
the `position: fixed` body technique. Note that technique is the only one of the tested approaches
that also blocks the scroll API, so a fix would silently invalidate the test above.

_Blast radius, unchanged._ All five surfaces share the hook: `StatsPanel`, `FilterSheet`, and the
three owner modals.
