# Logging a past session should pick the whole range in one calendar popup.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Instead of picking the start, hitting check, then the end, hitting check again. Noticed on mobile
2026-08-06; it is the same on desktop, since the cause is not mobile-specific.

_What is there now:_ two independent `<input type="date">` controls, "From" and "To", in
**`SessionDateFields.tsx`** (2026-08-19, extracted out of `EditGameModal` and always visible rather
than behind a disclosure). Each opens the platform's own picker, so two dates means two sheets and
two confirmations. They are already linked in the only ways HTML allows: `min` on the To field,
`max` of today on both, and a `problem` string that disables the dialog's Save and says why.

**A click-anywhere-opens-the-calendar attempt was made and reverted** (2026-08-19): calling
`showPicker()` from the input's `onClick` fights the browser, since clicking the calendar glyph
already opens the picker natively and the handler fired a second time, flickering it shut. The
CSS alternative, stretching `::-webkit-calendar-picker-indicator` over the whole field, does work
but swallows the clicks that place the text cursor, so it trades away direct typing. Whatever
replaces these needs both.

**iOS's Reset button is not a clear button, and no amount of JavaScript makes it one** (settled
2026-08-20, after two failed attempts to "fix" it). It reverts the field to the value it held when
the picker opened, so pressing it on an already-committed date reverts to that same date and nothing
visibly happens; it does not dismiss the popover either, since OK does that. **Do not try again.**

Two real defects came out of chasing it, both fixed. Each field now carries its own **"Clear"
button**, which is the only way to empty one on iOS, and which the "Add a start date, or clear the
end date" message already told people to do. And `useNativeValueSync` in `SessionDateFields.tsx`
subscribes to the raw `change` and `blur` events, re-reading the field on the next task: iOS's
revert fires nothing React listens to
([facebook/react#23299](https://github.com/facebook/react/issues/23299)), so spinning to a new date
and then pressing Reset used to leave the draft holding a date the field no longer showed, which
Save would then write.

Whatever replaces these inputs inherits both the moment it is controlled. Emptying the field has to
stay reachable in-app, since "leave 'To' empty" is the documented way to log a session that is still
open.

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

**The "make it a shared component first" prerequisite is done:** `SessionDateFields` is controlled
and stateless, holds no write of its own, and is what the "library-level create session button" item
should render.
