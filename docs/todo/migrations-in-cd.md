# Make database migrations run automatically as part of CD

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Instead of `alembic upgrade head` being run by hand from a laptop pointed at production.

_Premise correction, and it is most of the work:_ there is no CD pipeline to add a step to.
`.github/workflows/ci.yml` has only `build` and `api` jobs, both of which test; deploys happen
through Vercel's own GitHub integration, and `vercel.json` contains nothing but the daily health
cron. So this means **creating** a deployment workflow, not extending one.

_The ordering problem is the real design question._ Vercel offers no pre-deploy hook, so a GitHub
Action triggered on push to `main` races Vercel's build: whichever finishes first wins, and if the
deploy lands first there is a window where new code queries an old schema. The usual answer is to
make every migration backward-compatible (expand, migrate, contract across separate deploys) so the
race stops mattering — that is a discipline to adopt deliberately, not something the workflow
enforces. Worth deciding before automating, since the whole value of automating is not thinking
about it each time.

_Two things that must not be got wrong:_ **(1)** preview deploys must never migrate. They point at
production through a read-only role, so a migration from a preview branch is either an error or a
disaster depending on the role. Gate on the branch, not on `APP_ENV`. **(2)** the production
connection string becomes a GitHub secret, where today it exists only on your laptop and in
Supabase. That is a genuine expansion of where the credential lives, and worth weighing against how
rarely migrations actually run.

_Counter-argument worth keeping:_ auto-applying means a migration reaches production without anyone
reading its plan first. This project's habit so far is the opposite —
`docs/genre-backfill-runbook.md` exists because a preview-then-apply pass caught real damage that a
green test run had missed. `alembic upgrade head` is idempotent and safe to re-run, so a middle
option is a workflow that runs it on manual dispatch only: no laptop credentials, still a human
deciding when.

Note `alembic/env.py` reads the URL from `DATABASE_URL` via the settings object with no alias, and
`normalize_database_url` rewrites the `postgresql://` scheme itself, so the workflow can pass
Supabase's connection string through unmodified.
