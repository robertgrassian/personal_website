# Running the title and genre backfills

Two one-off scripts that rewrite a user's stored game titles and genres. This is
the procedure for running them against a real database, written down because the
ordering matters, one step is easy to skip, and the failure modes are not obvious
from the scripts themselves.

Applied to the **local** DB on 2026-08-03. Production is still pending.

## What they do, and why in this order

`scripts/backfill_titles.py` renames games and wishlist entries to canonical
titles from a hardcoded map. `scripts/backfill_genres.py` then re-derives genres
from Wikipedia game infoboxes (`app/services/genres.py`).

**Titles must run first.** The stored names were informal ("Civ 6", "Halo CE",
"Hades 2"), and those are what made the genre lookup fail or, worse, silently
match the wrong game. Measured locally, doing titles first moved the genre plan
from 118 auto / 36 needing review to **183 auto / 0**.

Both cover the library **and** the wishlist. The wishlist holds the same titles
and the same genre vocabulary and renders on the same page, so leaving it behind
would let a wishlist entry and a library row disagree about the same game.

Neither script needs credentials. The title map is hardcoded (no IGDB calls) and
the genre lookup uses Wikipedia, which needs no key. Only `DATABASE_URL`.

## Procedure

Run from `api/`. Pass the connection string inline rather than editing `.env`, so
a local shell is never left pointing at production.

```bash
cd api
export PROD_DB='postgresql://...'   # Supabase → Settings → Database, direct connection (not the pooler)
```

### 1. Titles

Preview is the default and only reads, so this is always a select before an
update:

```bash
DATABASE_URL="$PROD_DB" uv run python scripts/backfill_titles.py --user rgrassian
DATABASE_URL="$PROD_DB" uv run python scripts/backfill_titles.py --user rgrassian --apply
```

Read the preview. Three things it reports and what they mean:

- **renames** — what will change, per table.
- **BLOCKED** — the target name already exists. `games` is unique on
  `(user_id, name, system)` and `wishlist_items` on `(user_id, name)`, so these
  are skipped rather than allowed to abort the transaction. Resolve by hand.
- **mapping entries matched no row** — expected. The map covers the local
  library; anything already renamed or absent shows up here harmlessly.

### 2. Genres

```bash
DATABASE_URL="$PROD_DB" uv run python scripts/backfill_genres.py --plan --user rgrassian --force
DATABASE_URL="$PROD_DB" uv run python scripts/backfill_genres.py --show    # read this
DATABASE_URL="$PROD_DB" uv run python scripts/backfill_genres.py --apply
```

`--plan` is the only step that uses the network. `--show` and `--apply` read the
cached plan at `scripts/.genre_backfill_plan.json` (gitignored).

There is **no hand-editing step**. Rows where Wikipedia is vaguer or wrong live
in `OVERRIDES` in the script, and the one vocabulary alias in `SYNONYMS`. That
was a manual block for the first three runs and it is in the script precisely so
a fourth run cannot forget it.

Anything the plan marks `needs_review` or `missing` is left untouched and keeps
its current genres, which is a safe resting state.

### 3. Flush the cache — do not skip

`src/lib/libraryApi.ts` fetches with `cache: "force-cache"` and tags that are
only invalidated by `revalidateTag` on a write **through the app**. These scripts
write straight to Postgres, so nothing invalidates: **production keeps serving the
old titles and genres even though the database changed.**

Fix by making any owner write in the prod UI — rate a game and undo it. That
calls `revalidateTag(libraryCacheTag(username))` and refreshes the pages.

Do not rely on a redeploy. Vercel's Data Cache can survive a deployment, so an
explicit write is the only guaranteed flush.

### 4. Re-seeding

The seed fixtures in `scripts/fixtures/` already carry the canonical names, so
`seed.py` reproduces the renamed library. `sessions.csv` references games by
name, so if the map is ever extended, rename there in lockstep or seeded sessions
attach to nothing.

## Things that went wrong, so they are not rediscovered

- **The title map is hardcoded on purpose.** An earlier version scored IGDB
  search results and could not tell a canonical title from an edition or spin-off
  whose name merely extends it: "Elden Ring" → _Elden Ring Nightreign_, "Halo CE"
  → _Halo CE+_, "Dead Cells" → _Dead Cells+_. Every result needed reading anyway.
- **"Cadence of Hyrule" is deliberately not renamed** to its full canonical
  title. The longer string then matched the Wikipedia article "The Legend of
  Zelda" — its words are a subset of the long title — and took that game's
  genres.
- **Going through `search_games` rate-limits the script.** It allows 30 lookups
  per minute per user, so a full library silently recorded 126 of 155 titles as
  "no match". The script calls the IGDB service's internals instead.
- **Wikipedia contradicts itself on monster-taming.** The Pokemon infoboxes say
  "Monster tamer", Palworld's says "monster-taming". `SOURCE_SYNONYMS` in
  `app/services/genres.py` normalizes to the majority spelling. It cannot be
  deleted in favour of "just take the source's word", because there is no single
  source word. It lives in the service rather than the backfill script so the
  add-game flow gets the same answer -- a source conflict is a property of the
  source, not of one script.<br>
  That table is **not** a preference map. Nothing belongs in it because a nicer
  word exists: the library deliberately takes Wikipedia's vocabulary, which is
  why "role-playing" is stored as-is rather than folded to "RPG". An entry earns
  its place only when one concept has two names in the source.
- **An infobox `genre` that is the template's last parameter** used to swallow
  the article prose after it, so Majora's Mask picked up Japanese title text and
  "and quality of life changes" as genres. Fixed in `genres.py`, with a test.
