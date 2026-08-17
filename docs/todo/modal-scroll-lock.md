# The modal scroll lock does not actually stop the page scrolling.

_Section: **Bugs** &middot; index: [`TODO.md`](../../TODO.md)_

`useModalChrome` sets `document.body.style.overflow = "hidden"`, which looks correct and is why this
went unnoticed.

**Verified in Chromium 2026-08-17:** with `StatsPanel` open, `window.scrollBy(0, 500)` still moves
the page. `html` is the scrolling element here and stays `overflow: visible`, so the value set on
`body` never reaches the viewport.

_Blast radius._ All five surfaces share the hook: `StatsPanel`, `FilterSheet`, and the three owner
modals. A fix changes five at once.

_The constraint on the fix._ Whatever replaces it must restore the scroll position on close rather
than jumping the user to the top, which is the usual failure of the `position: fixed` body
technique.
