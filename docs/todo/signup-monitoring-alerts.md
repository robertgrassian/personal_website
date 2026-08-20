# Set up monitoring / alerting, specifically to get notified when a new user signs up for the game library.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

There is nothing today: no error tracking, no analytics, no email or webhook plumbing anywhere in
the repo. The only observability is stdlib `logging` in a handful of places
(`api/app/services/me.py`, `core/supabase_admin.py`) landing in Vercel function logs, which nobody
watches.

_The event to hook is the profile insert, not the auth user._ OAuth mints a Supabase `auth.users`
row before onboarding, so an abandoned onboarding leaves one with no profile, and an over-cap signup
has its auth user deleted again (`create_my_profile`, `api/app/services/me.py`). The single moment
that means "a real person joined" is `create_profile_with_follows` succeeding at line 307.

_What makes it more than a POST in the handler:_ the API runs as a Vercel serverless function
(`api/index.py`), so there is no daemon to watch anything. Two shapes, and they trade off
differently. **(a) In-request notify** — fire the webhook right after the profile commits. Simple,
but it must follow the rule already written a few lines above it for auto-follow: a nicety must
never be able to close signup, so it needs its own try/except and a timeout, and a serverless
function may be frozen before a fire-and-forget task runs. **(b) Out-of-band** — a Supabase Database
Webhook on `INSERT INTO profiles`, or a small endpoint polled by cron. Zero risk to the signup path
and zero app code for the webhook flavor; the cron flavor has precedent, since `vercel.json` already
runs one daily against `/api/library/health`.

_Decide the channel too_ (push, email, a Slack/Discord incoming webhook). Email means standing up a
transactional provider that does not exist yet; a webhook does not. Note the volume this is sized
for: `max_users` is 100 (`api/app/core/config.py`), so this is a handful of notifications ever,
which argues for the cheapest thing that works.

Related but different: the **Analytics on signups** item wants the funnel (how far people get
from landing to first game), where this one wants a ping when someone lands. Its privacy-policy
caveat applies here only if the answer is a third-party script. Worth deciding together whether the
same pass should also alert on errors, since "I want to know when something breaks" is the other
half of monitoring and has no item at all.
