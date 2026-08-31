# Clicking a wishlist game's notes field makes the sticky filter bar disappear (desktop)

_Section: **Bugs** &middot; index: [`TODO.md`](../../TODO.md)_

**The trigger is confirmed and a fix has shipped. The visible symptom is not confirmed, because it
does not reproduce in Chromium.** What is left is one check in the browser the report came from.

## What was measured

Reproduced against a real local stack (seeded Postgres + FastAPI + `npm run dev`) driving Chromium
1194 at 1280x800, on `/video-games` in the Want to Play view.

- **Stage two of the scroll lock was running on desktop.** Clicking the notes `<textarea>` put
  `document.body` into `position: fixed; top: -900px` and dropped `window.scrollY` to 0, exactly as
  on a phone. `preventRevealScroll` (`scrollLock.ts`) exists only for WebKit's reveal scroll of a
  field inside a fixed dialog and for Safari's URL bar pill, per
  [`docs/mobile-viewport.md`](../mobile-viewport.md): neither happens to a mouse-driven pointer, so
  this was pure cost.
- **"It only happens with this input" is exactly right, and the reason is `wantsKeyboard` in
  `useModalChrome`.** The wishlist card's other two controls are a checkbox (Starred) and a
  `<select>` (System), and both are deliberately excluded from raising stage two. The notes
  textarea is the only control on that card that is not.
- **The disappearance itself did not reproduce**, at four scroll depths and four different cards.
  Chromium keeps `position: sticky` working while the body is out of flow: the header held at
  `top: 64` throughout, before and after the click, and after closing the card. So the visible
  symptom depends on how the browser resolves sticky against a document with no scroll range, and
  Safari is the obvious candidate. WebKit could not be installed in the container to check.

## What shipped

`useModalChrome` now asks `hasSoftwareKeyboard()` before scheduling the escalation, so stage two is
skipped where the primary pointer is fine and hovers. Verified both ways in Chromium: a desktop
context leaves `body` `static` with its scroll position intact, and a `Pixel 5` context still goes
`fixed; top: -900px`. Gated on both `hover: hover` and `pointer: fine` so a touchscreen laptop keeps
today's behavior rather than losing the workaround it may need.

## What is left

Open the wishlist on the desktop browser the report came from, scroll far enough that the filter bar
is stuck, open a game and click into Notes. If the bar stays put, this is done and the entry can go.
If it still vanishes, the cause is something other than the body going out of flow, and the fix that
shipped is still correct on its own terms but is not this bug.

## The two questions the original report asked

- **Library game notes are not implemented yet**, so the bug cannot be checked there. That field is
  its own open item, **Give library games a "notes" field**.
- **The played-game card has its own trigger regardless**: `GameEditFields` renders the System
  `SuggestInput`, which is an `<input type="text">` and so raises stage two the same way. Whatever
  the wishlist card does on the reporting browser, that card should do too.
