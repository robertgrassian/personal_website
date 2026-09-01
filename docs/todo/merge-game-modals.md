# `AddGameModal` is the last dialog left. Decide whether adding a game moves onto the detail card too.

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
system and, on the same second face a real game uses, a session, and creates the row on Save via
`promoteAndSave`. That is the working precedent
for what merging `AddGameModal` in would look like, and the reason the add form's remaining problem
is narrow: a draft that does not exist yet plus a search step, not the field set.

_What they now genuinely share:_ `SuggestInput` (2026-08-14, rewritten as
a real combobox 2026-08-15), which owns the field, its suggestion list and that list's open/close,
filter and keyboard behaviour for all three forms, plus `SessionDateFields` and `RequiredField`
(both 2026-08-19), which `AddGameModal` does not use yet and probably should.

**The counter-argument won** (2026-08-20). Clicking a case now opens the back of the case at
reading size, and the owner's edit form lives on it: `EditGameModal` and `EditWishlistModal` are
deleted, and their bodies survive as `GameEditFields` and `WishlistEditFields`, which the card
renders. So there is no second modal to merge, and the open question is narrower and different:
**should adding a game move onto that surface too, or stay the one dialog?**

Two things pull against folding it in. An add has no case to fly out of, so it would arrive with no
motion, the way a promote does. And the search step is a real step, not a field: the card is sized
for reading a game you already have, not for browsing results. The cheap version is that `AddGameForm`
reuses `GameEditFields`' Save model and field set without the card shape at all.

_The add form has since closed part of the gap_ (2026-09-01): it took `SessionDateFields` and a
"Have you played it?" section of its own, and `addGame` now creates the row and logs a playthrough
in one press, the way `promoteAndSave` does. What is still unshared is the identity half (the cover
header, `CatalogInfo`, and the manual path's name/genres/release-date fields), which is the part
`GameEditFields` must not grow, since for an IGDB pick those belong to the shared catalog row.
