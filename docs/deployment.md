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

## One-time setup

Two GitHub environments, under Settings → Environments. Both must set their **deployment branch
policy to `main` only** — the default is every branch, and `workflow_dispatch` accepts any ref, so
without it a feature branch could be dispatched straight at production.

**`production`** — holds the approval gate, and the only credential that can change the schema.
Add **yourself as a required reviewer**, plus one environment secret:

- `DATABASE_URL` — a **session-mode** connection string, port 5432. Not the transaction pooler on
  6543 that the app itself uses: DDL through a transaction-mode pooler fails in ways that are hard
  to diagnose.

**`production-deploy`** — no reviewers. Nothing here changes the schema, so nothing here needs a
credential that could. Four secrets:

| Secret              | Value                                                                      |
| ------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`      | The **read-only** role below, not the owner role                           |
| `VERCEL_TOKEN`      | Vercel → Account Settings → Tokens                                         |
| `VERCEL_ORG_ID`     | Team (or Account) Settings → General, or `orgId` in `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | Vercel project → Settings → General, or `projectId` in the same file       |

The Vercel credentials are environment-scoped rather than repository-scoped on purpose: a
repository secret is readable by `ci.yml`, which runs on every pull request, and a Vercel account
token can pull the project's production environment variables, `SUPABASE_SERVICE_ROLE_KEY`
included.

### The read-only role

`verify` only asks the database which migration it is on. `alembic current` is read-only by
construction (`command.current()` passes `dont_mutate=True`, so it will not even create the version
table), which means the ungated environment never needs a credential that can write. Without this,
the approval gate protects an action but not a secret: the connection string would sit in an
environment anyone could read without approval.

Run once in the Supabase SQL editor:

```sql
-- Reads one table. Cannot write, cannot see anything else.
create role deploy_verifier with login password 'use-a-long-random-one';
grant connect on database postgres to deploy_verifier;
grant usage on schema public to deploy_verifier;
grant select on table public.alembic_version to deploy_verifier;
```

Then build `production-deploy`'s `DATABASE_URL` from the same connection string as the owner one,
with the username and password swapped for this role. Through Supabase's pooler the username
carries the project ref, so it becomes `deploy_verifier.<project-ref>` rather than
`postgres.<project-ref>`.

**If a job cannot connect, check IPv6 first.** GitHub's runners are IPv4-only, and Supabase's
direct connection (`db.<project-ref>.supabase.co`) is IPv6-only unless the project has the IPv4
add-on. The **session pooler** string (port 5432, a `pooler.supabase.com` host) is IPv4 and still
session mode, so it is usually the right one to paste for both environments. The transaction
pooler on 6543 is the one to avoid.

## Operating it

- **Redeploying the same commit:** run the workflow manually (Actions → Deploy → Run workflow) with
  _Apply pending migrations_ unchecked. It skips the approval gate, still runs `verify`, and
  redeploys.
- **A blocked deploy** (`verify` red, "The database is not at this commit's head revision") means a
  migration never got applied. Run the workflow manually with _Apply pending migrations_ checked,
  or apply it by hand.
- **Reverting a migration is not a `git revert`.** Reverting the commit deletes the script while
  the database is still stamped with its revision, and Alembic then fails with "Can't locate
  revision". Run `alembic downgrade` first, then revert the code.
- **By hand, always available:** `cd api && DATABASE_URL=... uv run alembic upgrade head`.
  `alembic upgrade head` is idempotent, so re-running it after a partial failure is safe.
- **Rolling back the code** is still the Vercel dashboard's Instant Rollback: CLI deploys are
  ordinary production deployments, so the previous one is one click away. It does not undo a
  migration, which is why the backward-compatibility rule above matters.
