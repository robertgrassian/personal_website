# api/bruno — the endpoint collection

Every HTTP endpoint this backend serves, as runnable requests. [Bruno](https://usebruno.com)
stores collections as plain text files in the repo instead of in a cloud
workspace, which is the reason it is here rather than Postman: the requests
version with the code that serves them, and a route that changes shows up in a
diff.

Each request's `docs` block is the endpoint's reference documentation. If you
only want to read the API, read those; you do not have to run anything.

## Setup

1. Install Bruno (`brew install --cask bruno`, or download from usebruno.com).
2. **Open Collection**, and pick this directory.
3. Choose an environment, top right:
   - **local** talks straight to uvicorn on `:8000` (`npm run dev:api`). Use this
     one by default: it takes Next.js out of the picture, so a failure is the
     API's.
   - **local via next** goes through `next dev` on `:3000` and its `/api/library`
     rewrite. Use it to prove the rewrite itself works.
   - **production** points at the live site. Reads are safe; the writes are real.
4. Run `Setup / Sign in and capture token` to fill `accessToken`. Everything
   under `Me *` inherits it from the collection.

Local auth needs two secrets that are deliberately not committed. Set them in
Bruno under the environment's secret vars: `serviceRoleKey` from
`supabase status` (or `SUPABASE_SERVICE_ROLE_KEY` in the repo-root `.env`), and
whatever you like for `testPassword`. Bruno keeps secret vars out of the `.bru`
files, so they never reach git.

If the test user does not exist yet, run `Setup / Create a local test user`
first, then sign in, then `Me profile and account / Create my profile` to get
past onboarding.

## Conventions worth knowing before you read the requests

- **`{{apiPrefix}}` is a variable** because the prefix is one literal string in
  `api/app/core/config.py` (`API_PREFIX = "/api/library"`). Changing it is meant to
  be a two-line change, there and in each environment here.
  `tests/test_bruno_collection.py` asserts the two agree, so a stale environment
  fails the suite rather than quietly pointing every request at nothing.
- **The prefix names the app, not the runtime.** It was `/api/py` until
  2026-08-18. A second segment is needed at all because `/api` is contested:
  Vercel routes it to the Python function and Next.js claims it for its own Route
  Handlers, so one subtree has to be spelled out as this API's. `/api/py` is still
  served as a hidden alias for pages loaded before the rename, and is not in the
  OpenAPI document or this collection.
- **camelCase on the wire, snake_case in Python.** The DTOs generate the aliases;
  bare query parameters do not get them automatically and have to declare them by
  hand (see `Preview a catalog entry`).
- **`""` rather than `null` for absent scalars** on read payloads, matching the
  frontend's "empty string means unset" convention. `igdbId` and `openSessionId`
  are the exceptions, since `0` is a real id.
- **`/users/*` is public and cached; `/me/*` is authenticated and never cached.**
  Anything that differs per viewer lives under `/me`, which is why the follow
  state is its own endpoint rather than a field on the profile.
- **404, not 403, for someone else's row.** Under `/me` the caller's own library
  is the whole namespace, so the API never confirms the existence of a row it
  will not show you.
- **Writes share one 60-per-minute budget per user**, across every mutating route
  rather than per endpoint. A 429 carries `Retry-After`.
- **Preview deploys refuse writes with a 503.** They point at production through
  a read-only Postgres role, and the guard turns what would be an ugly permission
  500 into a deliberate answer.

## Keeping it honest

The collection is hand-maintained, so it can drift. Two things keep it close:

- FastAPI serves the generated OpenAPI document at `{{apiPrefix}}/openapi.json`
  and Swagger UI at `{{apiPrefix}}/docs` when `APP_ENV=dev`. That is the
  generated truth about paths and shapes; this collection is the curated version
  with the reasoning attached.
- Adding an endpoint means adding it here, alongside the steps already in
  `api/README.md` under "Adding a new endpoint".
