# Tech spec: game recommendations

Status: **proposed**, 2026-10-03, hardened the same day. Not started.

"Based on the games you've played and liked, you should try …", as a third library tab beside
Played and Wishlist: a short **Upcoming** row and a longer **Released** section.

## Decisions already made

| Question            | Answer                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Who gets them       | Every user past the eligibility threshold (below).                                                                                          |
| Who sees them       | Everyone. A public tab on the existing cached public read path. Recommendations are not viewer-dependent, so one cached payload serves all. |
| Feedback in v1      | On the detail card's back, owner only: **Add to wishlist**, **Add to played**, and a quieter **Not interested**.                            |
| LLM                 | **None, in any role.** Ranking is deterministic math; explanations are templated from the nearest rated games.                              |
| Where the math runs | **Offline**, in a nightly batch job, never in the API function. See [Why offline](#why-offline).                                            |
| Algorithm family    | **Content-based**, not collaborative filtering. See [Why content-based](#why-content-based).                                                |

## Why content-based

Collaborative filtering ("people whose libraries overlap with yours also liked …") needs many users
with overlapping libraries. This site has a handful, so the matrix it factorizes would be almost
all empty. Content-based recommendation needs only one user's library plus a description of every
game: represent each game as a feature vector, represent the user's taste in the same space, and
rank unowned games by closeness. Collaborative filtering is out of scope until the user base grows
by orders of magnitude, and nothing here is built to anticipate it.

## Why offline

- **Size.** scikit-learn + numpy + scipy is well over 100MB installed. The deployed function
  installs `[project].dependencies` from `api/pyproject.toml`, and every cold start would pay for
  them.
- **Time.** A run makes dozens of IGDB requests (rate limit 4/s) and fits a model per user.
- **Shape.** The output changes at most daily, so a precomputed table read through the existing
  cache fits it exactly.

So the recommender is a **batch job** on a GitHub Actions cron that writes to Postgres, and the API
only reads rows. The heavy dependencies live in a new `recommender` dependency group, which the
deployed function never installs.

## Data sources

**Candidates come from IGDB, not from `game_metadata`.** That table holds only games some user
already added, which are the games least worth recommending to them.

**Features come from IGDB for both sides.** The library has Wikipedia-sourced genres, which are
better for display (see `api/README.md`), but a candidate has only IGDB data, and a similarity is
meaningless if the two vectors use different vocabularies. Every vector, library game and candidate
alike, is built from IGDB fields. Hand-entered games (no `igdb_id`) have no IGDB features and are
left out of the taste model.

IGDB fields, all on the `games` endpoint `services/igdb.py` already queries:

| Field                                                                     | Use                                                                        |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `genres`, `themes`                                                        | Multi-hot feature blocks; genre names also kept for display                |
| `player_perspectives`, `game_modes`                                       | Multi-hot                                                                  |
| `keywords`                                                                | TF-IDF block: the richest signal and the noisiest                          |
| `involved_companies.company` (where `developer`)                          | Multi-hot, sparse                                                          |
| `franchises`, `collections`                                               | Multi-hot, sparse; franchise also drives the MMR cap                       |
| `first_release_date`                                                      | Era feature, and the released / upcoming split                             |
| `similar_games`                                                           | Candidate generation only, never a feature                                 |
| `total_rating`, `total_rating_count`                                      | Quality prior for released games                                           |
| `hypes`                                                                   | Quality prior for upcoming games                                           |
| `platforms.name`                                                          | Candidate filter, and display                                              |
| `game_type`                                                               | Keep main games, standalone expansions, remakes, remasters, expanded games |
| `remakes`, `remasters`, `expanded_games`, `version_parent`, `parent_game` | Exclude other versions of games already owned, in both directions          |

## Data model

Four new tables, one Alembic migration. Every user-keyed table cascades from `profiles`, like the
rest of the schema.

### `igdb_game_features`: the feature cache

Every IGDB game the recommender has looked at, library and candidate alike. **Deliberately not
`game_metadata`**: that table means "a game somebody holds" and is re-sourced on read by
`catalog_refresh.py`, and thousands of candidate rows would change both meanings.

| Column                                        | Type                      | Notes                                                          |
| --------------------------------------------- | ------------------------- | -------------------------------------------------------------- |
| `igdb_id`                                     | `int` PK                  |                                                                |
| `name`, `cover_url`                           | `text`                    | Display, so the public read never calls IGDB                   |
| `genres`, `platforms`                         | `text[]`                  | IGDB's names; display, and `platforms` is the filter           |
| `first_release_date`                          | `date` NULL               | NULL = TBA                                                     |
| `features`                                    | `jsonb`                   | Raw id lists per field, plus `game_type` and the version links |
| `similar_games`                               | `int[]`                   |                                                                |
| `total_rating`, `total_rating_count`, `hypes` | `real`, `int`, `int` NULL |                                                                |
| `fetched_at`                                  | `timestamptz`             | Re-fetched after 7 days, or 1 day if unreleased                |

No user data. **No pruning in v1**: it grows by a few thousand rows a year at most.

### `recommendation_runs`: one row per user per run

| Column         | Type                     | Notes                                                                    |
| -------------- | ------------------------ | ------------------------------------------------------------------------ |
| `user_id`      | `uuid` PK, FK `profiles` |                                                                          |
| `generated_at` | `timestamptz`            |                                                                          |
| `modes`        | `jsonb`                  | `[{ "mode": 0, "because": [played_games.id, …] }]`: each shelf's heading |

This is what tells "never run" apart from "ran and found nothing", which a missing set of
`recommendations` rows cannot.

### `recommendations`: the job's output

| Column    | Type                                     | Notes                                                        |
| --------- | ---------------------------------------- | ------------------------------------------------------------ |
| `user_id` | `uuid` FK `profiles`                     |                                                              |
| `igdb_id` | `int` FK `igdb_game_features`            |                                                              |
| `section` | `text` CHECK in (`released`, `upcoming`) |                                                              |
| `rank`    | `smallint`                               | Order within the section, after reranking                    |
| `score`   | `real`                                   | For debugging and the eval report; never displayed           |
| `mode`    | `smallint` NULL                          | Released only: the taste mode, which is the shelf it sits on |
| `because` | `bigint[]`                               | `played_games.id` of the 2 or 3 nearest liked games          |

PK `(user_id, igdb_id)`. The job replaces a user's `recommendations` and `recommendation_runs`
rows **in one transaction**, so a reader never sees half a run.

`because` holds library row ids rather than names so a rename shows through, and a deleted library
game just drops out of the sentence at read time.

### `recommendation_dismissals`: "Not interested"

| Column       | Type                          |
| ------------ | ----------------------------- |
| `user_id`    | `uuid` FK `profiles`          |
| `igdb_id`    | `int` FK `igdb_game_features` |
| `created_at` | `timestamptz`                 |

PK `(user_id, igdb_id)`. No public route returns it. Its effect, the game vanishing from the public
tab, is visible to anyone, which is fine.

## Eligibility

A user is eligible with **at least 10 rated, IGDB-backed library games, using at least 2 different
ratings**. The second half matters because ratings are centered on the user's mean (below): if
every rating is the same, every weight is zero and there is nothing to learn from.

The check is one SQL count, and it lives in `app/services/recommendations.py`, **which the batch
job imports**, so the read's status and the job's eligibility cannot disagree. The import goes job
→ app only, never back.

## The algorithm

The pipeline is a pure function per user, `recommend(library, dismissals, pool, params) →
(rows, modes)`, with all I/O outside it. That is what makes it testable without the network and
runnable from a scratch script. All randomness (k-means initialization) takes a fixed
`random_state`, so the same inputs always give the same output.

### 1. Featurize

Each game becomes one sparse vector made of **blocks**, one per feature field:

- Multi-hot blocks for genres, themes, perspectives, modes, developers, franchises and collections.
- A TF-IDF block for keywords, with IDF fitted over the whole feature cache, so a rare keyword
  ("metroidvania") weighs more than a ubiquitous one ("open world"). `min_df=3` drops keywords
  too rare to compare on. The cache changes nightly, so IDF does too: outputs can drift slightly
  between runs with no library change, and nothing promises run-to-run stability.
- An era block of 5-year buckets, **soft**: a game scores 1 in its own bucket and 0.5 in each
  neighbour, so 1999 and 2000 are close rather than unrelated.

**Each block is L2-normalized, then multiplied by a block weight.** Without the normalization the
keyword block (hundreds of columns) would swamp the perspective block (a handful) by dimension
count alone. The whole vector is then L2-normalized, so cosine similarity is a dot product.
A game whose vector is all zeros (IGDB knows nothing about it) is dropped: cosine is undefined
for it.

Block weights are hyperparameters. Starting values: keywords 1.0, genres 0.8, themes 0.8,
perspectives 0.5, developers 0.4, modes 0.3, franchises and collections 0.3, era 0.2.

### 2. Weight the user's games

A rating becomes a signed weight **relative to that user's own mean**: `w = score(rating) −
mean(scores)`, with `score` the existing S=4 … F=0 scale from `src/lib/games.ts`. People rate
on different curves; someone who rates everything Great has said nothing by rating a game Great,
and centering makes their Perfects the signal.

- **Positives** are games with `w > 0`.
- **Negatives** are games with `w < 0` **and** a rating of Okay or Bad. Both conditions, so a
  game is never both: for someone whose mean is Great, a Good is below average but not a dislike,
  and for a harsh rater whose mean is under Okay, an Okay is above average and so a positive.
- **Both sets are rescaled to `(0, 1]`** by dividing by the largest `|w|` in the set. Raw `|w|`
  runs up to 4 depending on the user's mean, which would make `λ` below mean something different
  for every user.
- **Left out of the taste model in v1:** unrated games (unknown, not neutral), wishlist games
  (wanted but unplayed, so they cannot anchor "because you liked …"), and dismissals ("Not
  interested" as often means "not now" or "own it elsewhere" as "dislike"). All three are still
  exclusions. Feeding any of them in is a harness experiment.

### 3. Find taste modes (the clustering)

Taste has several distinct sides. If someone loves both Persona 5 and Celeste, the weighted
average of those vectors is a point between them, and the games nearest it are mediocre examples
of both. So **cluster the positives** and treat each cluster as a taste mode.

- **Algorithm:** k-means on the normalized vectors, positives' weights as `sample_weight`, so a
  Perfect pulls its centroid harder.
- **Re-normalize each centroid after the fit.** The mean of unit vectors is shorter than 1, and
  shorter still for a spread-out cluster, so an un-normalized centroid would make tight modes win
  every dot product. With unit centroids this is approximately spherical k-means: cosine geometry
  throughout.
- **Choosing k.** Silhouette score is undefined for `k = 1`, so: try `k` from 2 up to
  `min(6, n_positives // 3)`, keep the best silhouette, and **fall back to `k = 1`** when that best
  score is under `0.1` or there are fewer than 6 positives. Cap at 6 because each mode becomes a
  shelf. Silhouette is unweighted while the fit is weighted; that is acceptable for picking `k`.
  Sparse TF-IDF vectors may well push most users to `k = 1`, so the chosen `k` and every
  silhouette score go in the eval report, and the `0.1` floor is the first thing to revisit.
- `k` is a dial between two baselines worth keeping: `k = 1` is "one average taste", and one mode
  per liked game is plain item-to-item nearest neighbours.

### 4. The candidate pool

**Built once per night for everyone, before any user's pipeline runs**, so the pipeline itself
makes no network calls. Querying IGDB per taste mode was the first design and was dropped: modes
come out of step 3, inside the pure function, and every evaluation fold would need queries no
snapshot holds.

The pool, all stored in `igdb_game_features`:

1. **Popular games:** for each platform any eligible user has played on, the top 500 by
   `total_rating_count` (one request per platform).
2. **Upcoming games:** for the same platforms, `first_release_date > now`, or no date and
   `hypes > 0`, sorted by `hypes`, limit 200.
3. **Neighbours:** `similar_games` of every eligible user's positives.

Per user, the pipeline then selects from the pool locally, dropping:

- games already in the library or on the wishlist (on `igdb_id`), and **hand-entered** library and
  wishlist games, matched on `fold_text(name)` since they have no id
- dismissed games
- games on none of the user's platforms. "The user's platforms" is the set of `played_games.system`
  values, which are IGDB platform names whenever the game came from search, so this is a plain name
  intersection with the candidate's `platforms`. A hand-typed system that matches nothing is
  ignored, and **if none match, the filter is skipped** rather than returning nothing.
- a `game_type` outside the kept set in the fields table (DLC, bundles, ports, mods, episodes)
- **other versions of games already owned, in both directions:** any candidate with a
  `version_parent` (editions such as "Game of the Year", often `game_type` 0); a candidate whose
  `parent_game` is in the library; a candidate listed in a library game's `remakes`, `remasters`
  or `expanded_games`; and a candidate whose own `remakes` or `remasters` include a library game
- released games with `total_rating_count < 5`, too obscure for a trustworthy prior

### 5. Score

For candidate `c` with normalized vector `v`, unit centroids `μ_m` and rescaled weights `w`:

```
relevance(c) = max over modes m of  v · μ_m             # nearest taste mode
penalty(c)   = max over negatives d of  w_d · (v · d)
prior(c)     = quality prior, in [0, 1]
score(c)     = relevance − λ · penalty + β · prior
```

- `max` over modes rather than a mean is the point of step 3: a candidate only has to fit one side
  of your taste. Its argmax is also the candidate's `mode`.
- **Released prior:** the Bayesian average `(n·R + m·C) / (n + m)` divided by 100, with `R` the
  game's `total_rating`, `n` its count, `C` the mean rating across the cache and `m = 20`. A 98
  from 3 votes should not outrank an 88 from 3,000.
- **Upcoming prior:** `log(1 + hypes)`, divided by the largest in the pool.
- The two sections are ranked **separately and never compared**: an unreleased game has sparse
  IGDB data and would lose to any released game on relevance alone.
- Starting values: `λ = 0.5`, `β = 0.15`.

### 6. Rerank for variety (MMR)

Pure score order tends to return ten near-identical games. **Maximal marginal relevance** builds a
list greedily, each time picking

```
argmax over remaining c of   α · score(c) − (1 − α) · max over chosen s of (c · s)
```

with `α = 0.7`, plus one hard rule: at most 2 games from one franchise.

**Released: per mode, with quotas.** Running MMR over all 24 and then splitting by mode can leave
one shelf with 20 games and the rest with 1. So each mode gets a quota of the 24 in proportion to
its share of the positives' total weight, at least 2, and MMR fills each mode's quota from that
mode's candidates. A mode with no candidates gets no shelf, and its quota passes to the others.
**Upcoming:** one MMR list of 8.

### 7. Explain

Each rec's `because` is the 2 or 3 positives with the highest `w · (c · game)`, drawn from its
own mode for a released game and from all positives for an upcoming one. Each mode's heading in
`recommendation_runs.modes` is the 3 positives nearest its centroid. On the tab that reads
"Because you liked Hades, Dead Cells and Celeste".

## Evaluation harness

`api/recommender/evaluate.py`, run locally against a snapshot of the database and the feature
cache. This is where "it seems fine" becomes numbers.

- **Leave-one-out.** For each positive, build a fold in which the game is genuinely unknown:
  remove it from the profile, from the library exclusion set and from the version-exclusion set,
  recompute the user's mean, and rebuild the pool's neighbour part from the remaining positives'
  `similar_games` only (the cache holds every game's list, so this is local). Then run the pipeline
  and record where the held-out game ranks. Report two numbers:
  - **end-to-end**: it must reach the pool _and_ survive the filters, otherwise it counts as a
    miss. This is the one that matters.
  - **ranking only**: it is injected into the pool, isolating the scorer from recall.
- **Leave-one-franchise-out** as well, since holding out one Zelda while three others stay in the
  profile flatters the model.
- **Metrics:** hit rate at 10 and 24, and mean reciprocal rank.
- **Baselines on the same folds:** random, quality prior only, `similar_games` ordered by how many
  positives list it, `k = 1`, and one mode per liked game.
- **Tuning without fooling yourself.** Searching parameters on the same folds you report is
  optimistic, and one library of ~150 games is most of the data. So: split the positives in half,
  random-search block weights, `λ`, `β` and `α` on one half, and report only on the other. Prefer
  the starting values unless a change wins clearly on the reporting half. Winning values go in
  `api/recommender/params.py`, with the report that justified them committed beside it.

## Batch job

- **Code:** `api/recommender/` (`featurize.py`, `taste.py`, `pool.py`, `score.py`, `pipeline.py`,
  `run.py`, `evaluate.py`, `params.py`), run as `uv run python -m recommender.run` from `api/`. It
  reuses `app.services.igdb`'s query and token-cache seam, `app.core.db`, and `app.core.text`'s
  `fold_text`. **Nothing in `app/` imports `recommender`.** Add `/api/recommender/` to
  `.vercelignore`, whose rule is "does a running function read this file"; it never does.
- **Dependencies:** a `recommender` group in `api/pyproject.toml` (scikit-learn, numpy, scipy).
  `ci.yml` installs it with `uv sync --group recommender`. Test modules that need it open with
  `pytest.importorskip("sklearn")`, so a plain `uv run pytest` without the group skips them rather
  than failing.
- **IGDB throttling.** `_run_query` does not throttle, and turns a 429 into `IgdbUpstreamError`.
  The job shares its client id with live search and `catalog_refresh`, so a burst could get
  visitors' searches rejected too. The job's fetch loop therefore holds itself to **2 requests a
  second** (half the limit, leaving the rest for the site) and backs off and retries on a 429.
- **Workflow:** `.github/workflows/recommendations.yml`, nightly cron plus `workflow_dispatch` for
  a manual run (a new user who just rated their library). `concurrency: recommendations` so a
  manual run never overlaps the cron. `timeout-minutes: 20`. GitHub delays scheduled runs at busy
  times and disables them after 60 days without repository activity; `docs/deployment.md` should
  say so.
- **Credentials: a new GitHub environment, `recommendations`, with no approval gate.** The two
  existing ones cannot serve: `production` carries the owner-role `DATABASE_URL` behind a required
  reviewer, so a nightly run would sit waiting for approval, and `production-deploy`'s role is
  read-only. The new environment holds:
  - a `DATABASE_URL` for a **dedicated Postgres role**: `SELECT` on `profiles`, `played_games`,
    `play_sessions`, `wishlist_games`, `game_metadata` and `recommendation_dismissals`; read and
    write on `igdb_game_features`, `recommendations`, `recommendation_runs` and `igdb_tokens`
    (the shared token cache). Least privilege, because this credential is used unattended every
    night. **The role and its grants are created by hand**, the way `production-deploy`'s
    read-only role was (`docs/deployment.md`), not in a migration: roles are cluster-global, and a
    `CREATE ROLE` in a migration breaks on re-run and would have to exist in CI too.
  - the IGDB client id and secret the API already uses.
- **Per run:** load eligible users; delete runs and recommendations for users no longer eligible;
  build the pool and refresh stale feature rows; run the pipeline per user and replace their rows.
  One user's failure is logged and skipped, never fatal, but the job exits non-zero at the end if
  any user failed, so a broken night shows red in Actions.

### How the site sees a new run

Library reads are `force-cache` until a write calls `revalidateTag`, and the job is not a write the
site knows about. The recommendations fetch therefore uses **time-based revalidation**,
`next: { revalidate: 3600, tags }`, instead of `force-cache`: a new run shows up within an hour
after it lands. Next warns when `force-cache` and `revalidate` are both set, so it is one or the
other. Two side effects worth knowing, both acceptable: the library pages become ISR with a
one-hour period (the other five reads stay in the data cache, so a regeneration refetches only
this one), and it is stale-while-revalidate, so the first visit after expiry still gets the old
payload and triggers the refresh.

The alternative was a secret-guarded `POST /api/revalidate` route the job calls after each user. It
was rejected for v1: it adds a route, a shared secret in two places, and a production URL to the
job, all to save at most an hour on a list that changes nightly.

## API

### Read (public, cached)

`GET /api/library/users/{username}/recommendations`, shaped so each item fits the frontend's
`BaseGame` and therefore `GameCase` as-is:

```json
{
  "status": "ready",
  "ratingsNeeded": 0,
  "generatedAt": "2026-10-03T06:12:00Z",
  "upcoming": [
    {
      "igdbId": 1,
      "name": "…",
      "imageUrl": "…",
      "releaseDate": "2027-02-01",
      "genres": ["Adventure"],
      "platforms": ["Nintendo Switch 2"],
      "because": ["Hades", "Dead Cells"]
    }
  ],
  "released": [{ "igdbId": 2, "…": "…", "mode": 0 }],
  "modes": [{ "mode": 0, "because": ["Hades", "Dead Cells", "Celeste"] }]
}
```

`status`, derived at read time, in this order:

1. `needs_ratings`: not eligible. `ratingsNeeded` says how many more rated games it takes (or 1 if
   the count is met but every rating is the same). Lists are empty.
2. `pending`: eligible, but no `recommendation_runs` row yet.
3. `ready`: a run exists. Lists can still be empty if nothing survived the filters.

The read **anti-joins the library, the wishlist and the dismissals**, as the job did. That is what
makes a wishlist add or a dismissal take effect at once instead of the next night. The layers:
`routers/users.py` → `services/recommendations.py` → `repositories/recommendations.py`.

### Writes (owner-only, `/me`)

- `POST /api/library/me/recommendations/dismissals` with `{ "igdbId": … }`, idempotent. 404 if the
  id is not in the feature cache, which is also the guard against arbitrary ids.
- `DELETE /api/library/me/recommendations/dismissals/{igdb_id}`, for the undo.
- **Add to wishlist** reuses `POST /me/wishlist` with `name` and `igdbId`. Since 2026-09-23 a new
  IGDB row trusts nothing from the payload but the id, so the server needs nothing new.
- **Add to played** reuses `POST /me/games` the same way, plus the `system` it requires and the
  optional `rating` and first play session the card's form collects.

Both new endpoints go in the Bruno collection (`api/bruno/`); `test_bruno_collection.py` fails
otherwise.

## Frontend

### Fetching

`LibraryPage.tsx` gains a sixth read in its `Promise.all`, beside games, wishlist, sessions,
followers and following. That keeps the `CLAUDE.md` rule that nothing the library shows is
fetched from the browser afterwards, so the tab has no loading state.

**A 404 must not fail the build.** `next build` prerenders `/video-games` against production's
API, and `fetchUserResource` throws on a 404 unless `allowMissing` is set. If the frontend ever
deployed before the endpoint, the build would fail, and it could not be fixed by deploying,
which is the deadlock `fetchFollowList`'s comment describes. So the read uses `allowMissing` and
treats a 404 as `pending` with empty lists, with the same warning `fetchFollowList` logs.
`fetchUserResource` also needs two small extensions: a list of tags rather than one resource tag,
and the `revalidate` option in place of the hardcoded `force-cache`.

**Tagging, chosen so no existing write needs editing.** The read carries `libraryCacheTag`,
`gamesTag`, `wishlistTag`, and a new `recommendationsTag`. Every library and wishlist write already
revalidates one of the first three, and each of those writes can change this read (the anti-join,
or the eligibility count after a rating edit). Only the two dismissal writes revalidate
`recommendationsTag` itself. The cost is that a rating edit also refetches recommendations, one
indexed query.

### The tab

- **A third member of the `View` union, not of `GameView`.** In `libraryConfig.ts`, `GameView`
  means "has filter, group and sort config" (`VIEW_CONFIG` is keyed by it), and `View = GameView |
PeopleView` exists so a tab without that pipeline cannot fall into the `view === "played" ? … :
…` branches in `GameShelves.tsx`. A recommendations view joins `View` the way `PeopleView` did,
  and `GameLibrary.tsx` gets a third branch rendering the tabs plus `RecommendationsView`, as it
  does for `PeopleList`. The filter bar never appears on it: the order is the ranking and the
  grouping is the taste modes.
- **Its own `LibraryCardProvider`, with `kind: "recommendation"`.** `GameLibrary` derives
  `cardKind` as `view === "wishlist" ? "wishlist" : "game"`, so without this a recommendation
  would open as a library game, with its IGDB id taken as a `played_games.id`: the wrong game's
  card, or none.
- **A tap flips the case into the detail card**, the same flight every other case does.
  `GameDetailCard`'s `CardSubject` gains a fourth member, `{ kind: "recommendation"; rec }`; a
  recommendation already fits `BaseGame`, which is what the card's shared surfaces read. The back
  shows the game's info (release date, genres, platforms) and the "Because you liked …" line, then
  the owner's actions. A visitor's card is the same card with the action region not rendered,
  exactly as a visitor's library card is today.
- **Layout:** an **Upcoming** shelf on top, then one shelf per taste mode headed "Because you
  liked …", rendered with the **active theme's shelf group** (`SHELF_GROUPS`). A recommendation
  fits `GameCaseInput` with `id` set to `igdbId` and `system` set to `""`, so the shelf, the
  theme and `GameCase` are reused rather than forked, as the shelf-theme convention requires.
- **Visibility:** visitors see the tab only when `status` is `ready` and a list is non-empty. The
  owner always sees it, with the empty states:
  - `needs_ratings`: "Rate N more games to get recommendations."
  - `pending`: "Your first recommendations arrive overnight."
  - `ready` but empty: "Nothing new to recommend right now. Check back tomorrow."
- **Actions on the card's back, owner only.** All three create a row, so all gate on
  `useIsConfirmedOwner`, never `useIsLikelyOwner`.
  - **Add to wishlist:** one tap, no form. The entry starts with no system, unstarred and without
    notes, all editable afterwards from its own card.
  - **Add to played:** opens the add form on the card, because a library row needs a `system`.
    This is the existing `promote` path's shape: `GameEditFields` already renders a draft form
    whose one Save creates the row (the "one-Save model" `CLAUDE.md` says new owner forms
    adopt), with system, optional rating and an optional first session. The system suggestions
    are the game's platforms, the ones the user already owns listed first.
  - **Not interested:** a quieter text button below the two.
  - After any of them the card closes and the next render drops the game: the add writes
    revalidate `gamesTag` or `wishlistTag`, which this read carries, and the anti-join does the
    rest.
- **Undo for a dismissal.** The dismiss action revalidates, and the re-rendered read no longer
  contains the game, so the undo cannot be drawn from props. `RecommendationsView` keeps each
  dismissed recommendation in client state, keyed by its position, and renders an **Undo** in that
  slot until it is clicked or the page is left. There is no site-wide toast to use instead (see
  the backlog's **Show a confirmation toast after logging a session**).
- Copy follows the no-em-dash rule, and every surface supports light and dark mode.

New: `src/lib/recommendations.ts` (types), `src/components/video_games/RecommendationsView.tsx`,
and server actions `dismissRecommendation` / `undoDismissRecommendation` in
`video-games/actions.ts`.

## Testing

- **Pipeline (pytest, no network):** block norms; rating centering; that Okay and Bad are
  negatives and a below-average Good is not, for both a generous and a harsh rater; weight
  rescaling; the `k` fallback to 1; unit-length centroids; that max-over-modes prefers a game near
  one mode to a game between two; the version exclusions in both directions; the per-mode quotas
  and the franchise cap; and the prior's ordering (98 from 3 votes below 88 from 3,000).
- **Evaluation folds:** that a fold removes the held-out game from every exclusion set and from
  the neighbour pool's sources, so the harness cannot leak.
- **Read and writes (DB-gated, as today):** the three statuses and the eligibility edge (ten
  identical ratings is `needs_ratings`); the read-time anti-joins; dismissal idempotence and the
  404 for an unknown id; and that no public payload carries the dismissals.
- **Frontend (`node --test`):** the pure helpers, such as grouping released recs by mode and
  building the "Because you liked" sentence.

## Docs to update when this lands

Per the ownership rule in `CLAUDE.md`: the four tables and their reasoning in `api/README.md`'s
data model; the batch path, the time-based revalidation and the ISR it implies in
`docs/architecture.md`; the new environment, the hand-made role and the workflow (including
GitHub's scheduled-run caveats) in `docs/deployment.md`; and new rows in `CLAUDE.md`'s "Where
things live" table.

## Phases

1. **Prove the algorithm.** A local script pulls the library and IGDB features into memory, then
   featurize, taste, score, MMR and the harness. No migration, no UI. This is where the
   algorithm question actually gets answered, and it is cheap to throw away. **Exit criterion:**
   with its _starting_ parameters, the pipeline beats every baseline on end-to-end MRR. Tuning
   comes after, on the split described in the harness, so the gate is never judged on the folds
   it was tuned on.
2. **Persist.** The migration (four tables), the hand-made role and environment, the pool and
   feature-cache fetcher, `run.py`, the workflow.
3. **Read and tab.** The endpoint, `fetchRecommendations`, the tab, empty states.
4. **Feedback.** The recommendation card subject, Add to wishlist, Add to played, dismiss and undo.

## Open questions

- **IGDB terms.** Confirm that a cached copy of IGDB data and any required attribution fit their
  terms, as the catalog already relies on.

## Explicitly not in v1

- Collaborative filtering.
- An LLM in any role. It was considered for the explanation line and declined.
- A supervised model predicting ratings from features (ridge or logistic regression). A good
  phase-2 experiment, since the harness can score it against clustering on the same splits.
- Wishlist games or dismissals in the taste model, and a bonus for games played in more than one
  stint. `play_sessions` rows are stints, not replays, so a long RPG played in two sittings would
  count. All three are harness experiments first.
- HDBSCAN. It cannot take `sample_weight`, so it is not a like-for-like comparison with weighted
  k-means, and it needs a rule for the positives it labels noise. Revisit if k-means proves a poor
  fit.
- Recompute on every rating change. Nightly plus a manual run is enough.
- Pruning the feature cache.
