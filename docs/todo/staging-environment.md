# Staging environment

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

The instanced game libraries project deliberately accepted a "no staging" caveat: previews are
read-only against prod, so writes first run for real in prod.

**Promoted in priority 2026-07-28:** the preview `500 MIDDLEWARE_INVOCATION_FAILED`, since fixed,
was this caveat biting for real.

_The stopgap and its cost._ Pointing Preview at production's Supabase works, but it means preview
sign-ins are production accounts.

_The real fix._ A second Supabase project, with its own DB, its own GoTrue and its own Google OAuth
client, would give previews a real identity system and finally let the write path be exercised
somewhere that is not prod.
