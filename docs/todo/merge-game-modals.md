# There probably should not be two game modals. Merge `AddGameModal` and `EditGameModal` into one.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Raised 2026-08-14 while fixing the system field in both: the same question ("which console is this
on?") had two different answers depending on which dialog you opened, and fixing it meant the same
change twice.

_Why they diverged, which is the thing to design around._ They are not two views of one form.
`AddGameModal` owns a search step and a draft that does not exist yet, and `GameDraftForm` splits
its fields on `draft.igdbId` because an IGDB pick resolves to a SHARED catalog row it must not
pretend to edit. `EditGameModal` owns a row that already exists.

**The per-field-writes question this used to pose is now answered** (2026-08-19): `EditGameModal`
has ONE Save, always rendered and disabled until something is pending, and nothing in it writes
before that press. Rating, system, session and stop-playing all buffer to drafts; only delete stays
immediate, behind its own confirm. So a merge no longer has to decide the submit model, it has to
adopt this one. `AddGameModal` is now the odd one out.

**`EditGameModal` also already absorbed a second dialog** (2026-08-19): it takes an `EditSubject`
that is either an existing row or a wishlist entry being promoted, so a promote collects rating,
system and a session and creates the row on Save via `promoteAndSave`. That is the working precedent
for what merging `AddGameModal` in would look like, and the reason the add form's remaining problem
is narrow: a draft that does not exist yet plus a search step, not the field set.

_What they now genuinely share:_ `SuggestInput` (2026-08-14, rewritten as
a real combobox 2026-08-15), which owns the field, its suggestion list and that list's open/close,
filter and keyboard behaviour for all three forms, plus `SessionDateFields` and `RequiredField`
(both 2026-08-19), which `AddGameModal` does not use yet and probably should.

_Sequence this with the three items that also want to reshape these dialogs_, or it will be done
twice: **"When adding a game, let me say I'm playing it now"** in Up Next adds a play-history
section to the add form, **"Make library and wishlist entries fully editable"** wants one shared
field form across both modals, and **"Make viewing a game's details better"** floats hosting edit
controls on the flipped card face, which would delete `EditGameModal` rather than merge it. That
last one is the real counter-argument: if edit moves onto the card, there is no second modal left to
merge.
