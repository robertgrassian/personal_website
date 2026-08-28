# Deployment

Production deploys run from [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), not
from Vercel's git integration. `vercel.json` sets `git.deploymentEnabled.main` to `false`, so a
push to `main` produces no Vercel deploy on its own; the workflow migrates first and then calls
the Vercel CLI. That ordering is the whole point: Vercel has no pre-deploy hook, so a workflow
running beside the git integration would race it, and a lost race means new code querying an old
schema. Preview deploys are untouched, since only `main` is disabled: every PR still gets its
preview and its Vercel build check, and no preview branch can ever migrate.

Four jobs run on a push to `main`:

| Job       | What it does                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `changes` | Diffs the push for anything under `api/alembic/versions/`. Decides only whether an approval is needed.                 |
| `migrate` | Runs when that diff is non-empty, in the `production` environment, whose required reviewer pauses the run for a click. |
| `verify`  | Asks the database whether it is at this commit's head revision. **This is the gate.**                                  |
| `deploy`  | `vercel deploy --prod`. A plain `needs: verify`, so it runs only if `verify` actually succeeded.                       |

**`verify` is what makes the pipeline safe, not the diff.** The push diff can be wrong in several
ordinary ways: the concurrency group cancels a run that was still queued, so its migration never
runs; an approval is rejected and then a later unrelated push carries that same code forward; a
history is rewritten. In every one of those the database is left behind the code, and `verify`
runs `alembic current --check-heads`, which fails rather than deploying. A wrong diff therefore
costs an unnecessary approval or a blocked deploy, never a deploy onto an unmigrated database.

**Migrations must still be backward-compatible with the deployed code.** Correct ordering shrinks
the window where old code meets the new schema; it does not remove it, because the Vercel build
takes minutes and the old deployment serves throughout. Add columns nullable, backfill, ship the
code that reads them, and drop the old ones in a _later_ deploy.

**Tests are not a gate here, and never were.** `ci.yml` runs on pull requests only, and the old git
integration deployed every push to `main` regardless. A push straight to `main` therefore deploys
without a test run, same as before; the protection is the branch ruleset requiring the `build`
check on the PR.

## Setup

Deploys run on two GitHub environments, both restricted to the `main` branch:

- **`Production`** holds the approval gate and the only credential that can change the schema: one
  required reviewer, and a session-mode `DATABASE_URL` for the owner role.
- **`production-deploy`** has no reviewer, because nothing in it can change anything. It holds
  `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and a `DATABASE_URL` for a read-only role
  that can select from `alembic_version` and nothing else.

That split is the point rather than an accident. `verify` runs on every push and must not wait on a
click, so its secret sits in an environment anyone who can run a workflow on `main` can reach. Given
that, it must not be a credential that could migrate: the gate would then protect the action but not
the capability. `alembic current` is read-only by construction (`command.current()` passes
`dont_mutate=True`, so it will not even create the version table), which is what makes a
`SELECT`-only role sufficient.

The Vercel credentials are environment-scoped rather than repository-scoped for the same reason: a
repository secret is readable by `ci.yml`, which runs on every pull request, and a Vercel account
token can pull the project's production environment variables, `SUPABASE_SERVICE_ROLE_KEY` included.

Standing this up is a one-time ritual with real credentials in it, so the step-by-step lives outside
the repo, in the gitignored `docs/deployment-setup.local.md`.

**If a job cannot connect, check IPv6 first.** GitHub's runners are IPv4-only, and Supabase's direct
connection (`db.<project-ref>.supabase.co`) is IPv6-only unless the project has the IPv4 add-on. The
**session pooler** string (port 5432, a `pooler.supabase.com` host) is IPv4 and still session mode,
so it is the right one for both environments. The transaction pooler on 6543 is the one to avoid:
DDL through a transaction-mode pooler fails in ways that are hard to diagnose.

## Operating it

- **Redeploying the same commit:** run the workflow manually (Actions → Deploy → Run workflow) with
  _Apply pending migrations_ unchecked. It skips the approval gate, still runs `verify`, and
  redeploys.
- **A blocked deploy** (`verify` red, "The database is not at this commit's head revision") means a
  migration never got applied. Run the workflow manually with _Apply pending migrations_ checked,
  or apply it by hand.
- **`VERCEL_TOKEN` expires, and when it does every production deploy stops.** The current token was
  created 2026-08-28 with a one-year expiration, so it lapses around **2027-08-28**. The symptom is
  the `deploy` job failing on an authentication error from the Vercel CLI while `changes`, `migrate`
  and `verify` all stay green: the database is fine, the code is fine, the credential is dead. Fix
  is a new token (Vercel → Account Settings → Tokens) and `gh secret set VERCEL_TOKEN --env
production-deploy`. Nothing warns you in advance, which is why the date is written here.
- **Reverting a migration is not a `git revert`.** Reverting the commit deletes the script while
  the database is still stamped with its revision, and Alembic then fails with "Can't locate
  revision". Run `alembic downgrade` first, then revert the code.
- **By hand, always available:** `cd api && DATABASE_URL=... uv run alembic upgrade head`.
  `alembic upgrade head` is idempotent, so re-running it after a partial failure is safe.
- **Rolling back the code** is still the Vercel dashboard's Instant Rollback: CLI deploys are
  ordinary production deployments, so the previous one is one click away. It does not undo a
  migration, which is why the backward-compatibility rule above matters.
