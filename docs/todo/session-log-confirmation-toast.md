# Show a confirmation toast after logging a session, so you know it worked.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Possibly with a "view all sessions for {game}" link in it, per **"Editing and deleting past sessions"**.

_What happens today:_ on success the save in `GamePlayHistory.tsx` clears the date drafts
(`sessionDraft.reset()`) and deliberately stays on the history face so the new row is visible. So there is _a_ signal, just not an affirmative
one, and only failure gets words (`setError`). The gap is worst for a backdated **closed** session:
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
(far cheaper, no portal, no timers, but useless for the writes that close their dialog). It needs
`role="status"` so screen readers announce it, and both color schemes. Note a link inside a toast
raises a question the inline version does not: the edit modal is still open, so "view all sessions"
has to decide whether it replaces the modal's contents or closes it and navigates.

**The one-Save redesign made this sharper** (2026-08-19, and the surface is now the detail card's
history face rather than a modal): the card stays open after a successful Save, so a Save that only
logged a closed past session changes nothing visible beyond the date fields clearing and a row
appearing in a list you may have scrolled past. There is no success text and no live region, so the
honest read is "did that do anything?". Deliberately not solved with a one-off here, because this item owns
the site-wide primitive.
