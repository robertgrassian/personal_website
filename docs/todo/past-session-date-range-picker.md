# Logging a past session should pick the whole range in one calendar popup.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Instead of picking the start, hitting check, then the end, hitting check again. Noticed on mobile
2026-08-06; it is the same on desktop, since the cause is not mobile-specific.

_What is there now:_ two independent `<input type="date">` controls, "From" (`EditGameModal.tsx`)
and "To", inside the `logOpen` block. Each opens the platform's own picker, so two dates means two
sheets and two confirmations. They are already linked in the only ways HTML allows: `min={logStart}`
on the To field, `max` of today on both, and a `logDatesInvalid` guard disabling Save on an inverted
range.

_The constraint that rules out a stock range picker:_ the end date is optional on purpose. "Leave
'To' empty if you're still playing it" logs a backdated session that is still open, which is what
makes the game currently-playing. Most range pickers model a range as two required endpoints, so
whatever is used needs a first-class "no end yet" state, not a blank the user must understand to
leave alone.

_The real cost is leaving native inputs behind._ `type="date"` is free today: no JavaScript, correct
locale, correct on every platform, and accessible without effort. A range calendar means a
dependency (react-day-picker or similar) or a hand-rolled one, plus keyboard support, focus
management inside an already-open dialog, and both color schemes per the light/dark rule. Weigh that
against a two-tap annoyance on a control the owner uses a handful of times a week. A cheaper middle
ground worth considering first: default "To" to the start date once "From" is set, so the common
single-day session needs no second pick at all.

Related: the "library-level create session button" item plans to reuse this same past-dates
form, so whatever this becomes should be a shared component rather than more markup inside
`EditGameModal`.
