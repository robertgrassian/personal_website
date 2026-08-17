# Document the database restore procedure.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Carried over from the spec's Phase 6 when that document was deleted (2026-07-30).

_The backup half is already handled._ Supabase takes daily backups on the free tier, so there is no
work there. What does not exist is any written answer to "the data is gone, now what".

_An untested restore is not a backup._ The useful version of this is running one against a scratch
project once and writing down what actually happened, in `docs/dev-setup.md` or beside it.

_Worth knowing before it matters:_ the free tier's retention window is short, days rather than
months.
