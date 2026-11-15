# Show a confirmation toast after logging a session, so you know it worked.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Possibly with a "view all sessions for {game}" link in it, per **"Editing and deleting past sessions"**.

_What happens today_ (since 2026-11-15): a successful Save in `GameEditFields.tsx` closes the
detail card with its normal return flight, from any face. So there is _a_ signal (the card leaving
means it worked; a failure keeps it open with words via `setError`), just not an affirmative one,
and the new session row is no longer on screen at all. The gap is worst for a backdated **closed** session:
nothing else on screen changes, because a past session with an end date moves no shelf and does not
light up the CRT. An open-ended log is the opposite case, where the game becomes currently-playing
and the change is obvious.

_One thing this codebase already gets right:_ `isPending` deliberately spans the whole write _plus_
revalidation (`useServerAction.ts`), so a toast fired when the transition settles is
telling the truth about the data having landed, not just about the request having been accepted.

_What makes it more than a `<div>`:_ there is **no toast infrastructure anywhere in `src/`** today,
and no `aria-live` region either, so this is a small design decision about a site-wide primitive,
not a local one. Decide up front whether it is a global toast host in the root layout (reusable by
every owner write: rating, add, delete, wishlist, follow) or an inline "Saved" line inside the modal
(far cheaper, no portal, no timers, but useless for the writes that close their dialog, which now
includes the detail card's Save, so the inline option is effectively ruled out). It needs
`role="status"` so screen readers announce it, and both color schemes. A "view all sessions" link
in the toast would have to reopen the card on its history face, since the card is closed by then.

**Save closing the card made this sharper** (2026-11-15): a Save that only logged a closed past
session changes nothing visible on the library once the card has flown back. There is no success
text and no live region. Deliberately not solved with a one-off here, because this item owns the
site-wide primitive.

**The before-Save half of the same problem** came from the staged "Stop Playing" item, closed
2026-10-11 when the stop became an editable From/To row: a pending change made on the face you are
not looking at is invisible until you go back to it. A count on the Save button ("Save 2 changes")
would cover every face at once, and wants deciding alongside this rather than separately.
