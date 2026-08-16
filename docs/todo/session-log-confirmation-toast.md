# Show a confirmation toast after logging a session, so you know it worked.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Possibly with a "view all sessions for {game}" link in it, per **"An easy way to view a game's sessions"**.

_What happens today:_ on success `saveLoggedSession` collapses the form and clears the fields
(`EditGameModal.tsx`) and the dialog stays open. So there is _a_ signal, just not an affirmative
one, and only failure gets words (`setError`). The gap is worst for a backdated **closed** session:
nothing else on screen changes, because a past session with an end date moves no shelf and does not
light up the CRT. An open-ended log is the opposite case, where the game becomes currently-playing
and the change is obvious.

_One thing this codebase already gets right:_ `isPending` deliberately spans the whole write _plus_
revalidation (comment at `EditGameModal.tsx`), so a toast fired when the transition settles is
telling the truth about the data having landed, not just about the request having been accepted.

_What makes it more than a `<div>`:_ there is **no toast infrastructure anywhere in `src/`** today,
and no `aria-live` region either, so this is a small design decision about a site-wide primitive,
not a local one. Decide up front whether it is a global toast host in the root layout (reusable by
every owner write: rating, add, delete, wishlist, follow) or an inline "Saved" line inside the modal
(far cheaper, no portal, no timers, but useless for the writes that close their dialog). It needs
`role="status"` so screen readers announce it, and both color schemes. Note a link inside a toast
raises a question the inline version does not: the edit modal is still open, so "view all sessions"
has to decide whether it replaces the modal's contents or closes it and navigates.
