# There probably should not be two game modals. Merge `AddGameModal` and `EditGameModal` into one.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Raised 2026-08-14 while fixing the system field in both: the same question ("which console is this
on?") had two different answers depending on which dialog you opened, and fixing it meant the same
change twice.

_Why they diverged, which is the thing to design around._ They are not two views of one form.
`AddGameModal` owns a search step and a draft that does not exist yet, and `GameDraftForm` splits
its fields on `draft.igdbId` because an IGDB pick resolves to a SHARED catalog row it must not
pretend to edit. `EditGameModal` owns a row that already exists and writes each field independently:
rating and system each buffer to a draft with their own Save (2026-08-15),
while sessions and delete still write on click. So a merge has to answer what a single dialog does
about per-field writes versus one submit — half-answered now that two fields confirm and the rest do
not.

_What they now genuinely share, and it is only one thing:_ `SuggestInput` (2026-08-14, rewritten as
a real combobox 2026-08-15), which owns the field, its suggestion list and that list's open/close,
filter and keyboard behaviour for all three forms. Everything else is coincidental resemblance.

_Sequence this with the three items that also want to reshape these dialogs_, or it will be done
twice: **"When adding a game, let me say I'm playing it now"** in Up Next adds a play-history
section to the add form, **"Make library and wishlist entries fully editable"** wants one shared
field form across both modals, and **"Make viewing a game's details better"** floats hosting edit
controls on the flipped card face, which would delete `EditGameModal` rather than merge it. That
last one is the real counter-argument: if edit moves onto the card, there is no second modal left to
merge.
