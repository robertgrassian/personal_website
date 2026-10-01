# personal_website

The code behind [rgrassian.com](https://rgrassian.com): a home page, an about
page, my resume, and a video game library.

## Stack

- Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4
- FastAPI, SQLAlchemy and Alembic on Python 3.12
- Postgres and Google sign-in through Supabase
- Hosted on Vercel, front end and API together

## The game library

Every game I've played, as cases on a wooden shelf, with a CRT above it showing
what I'm playing now. Anyone can browse, filter, group and sort it, or run SQL
against it from the stats panel. Signing in gets you your own library at
`/video-games/u/{username}`, with IGDB search for adding games, ratings, play
sessions, a wishlist and follows. Mine lives at `/video-games`.

## Running it

```bash
npm install
supabase start
cp .env.example .env
cd api && uv sync && uv run alembic upgrade head && uv run python scripts/seed.py && cd ..
npm run dev:full
```

That needs Docker, uv and the Supabase CLI. The details are in
[`docs/dev-setup.md`](docs/dev-setup.md).

## Docs

- [`docs/architecture.md`](docs/architecture.md): request flow, auth, design decisions
- [`api/README.md`](api/README.md): backend layers and data model
- [`docs/catalog-refresh.md`](docs/catalog-refresh.md): how shared game data stays current
- [`docs/deployment.md`](docs/deployment.md): production deploys and migrations
