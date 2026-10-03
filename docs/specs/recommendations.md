# Tech spec: game recommendations

Status: **proposed**, 2026-10-03, hardened the same day. Not started.

"Based on the games you've played and liked, you should try …", as a third library tab beside
Played and Wishlist: a short **Upcoming** row and a longer **Released** section.

## Decisions already made

| Question            | Answer                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Who gets them       | Every user past the eligibility threshold (below).                                                                                          |
| Who sees them       | Everyone. A public tab on the existing cached public read path. Recommendations are not viewer-dependent, so one cached payload serves all. |
| Feedback in v1      | **Add to wishlist** and **Not interested**, owner only.                                                                                     |
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

| Field                                            | Use                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `genres`, `themes`                               | Multi-hot feature blocks; genre names also kept for display                |
| `player_perspectives`, `game_modes`              | Multi-hot                                                                  |
| `keywords`                                       | TF-IDF block: the richest signal and the noisiest                          |
| `involved_companies.company` (where `developer`) | Multi-hot, sparse                                                          |
| `franchises`, `collections`                      | Multi-hot, sparse; franchise also drives the MMR cap                       |
| `first_release_date`                             | Era feature, and the released / upcoming split                             |
| `similar_games`                                  | Candidate generation only, never a feature                                 |
| `total_rating`, `total_rating_count`             | Quality prior for released games                                           |
| `hypes`                                          | Quality prior for upcoming games                                           |
| `platforms.name`                                 | Candidate filter, and display                                              |
| `game_type`                                      | Keep main games, standalone expansions, remakes, remasters, expanded games |
| `remakes`, `remasters`, `expanded_games`         | Read on library games only, to exclude new versions of games already owned |

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

The pipeline is a pure function per user, `recommend(library, dismissals, features, params) →
(rows, modes)`, with all I/O outside it. That is what makes it testable without the network and
runnable from a scratch script. All randomness (k-means initialization) takes a fixed
`random_state`, so the same inputs always give the same output.

### 1. Featurize

Each game becomes one sparse vector made of **blocks**, one per feature field:

- Multi-hot blocks for genres, themes, perspectives, modes, developers, franchises and collections.
- A TF-IDF block for keywords, with IDF fitted over the whole feature cache, so a rare keyword
  ("metroidvania") weighs more than a ubiquitous one ("open world"). `min_df=3` drops keywords
  too rare to compare on.
- A one-hot era block in 5-year buckets.

**Each block is L2-normalized, then multiplied by a block weight.** Without the normalization the
keyword block (hundreds of columns) would swamp the perspective block (a handful) by dimension
count alone. The whole vector is then L2-normalized, so cosine similarity is a dot product.
A game whose vector is all zeros (IGDB knows nothing about it) is dropped: cosine is undefined
for it.

Block weights are hyperparameters, tuned by the harness. Starting values: keywords 1.0, genres 0.8,
themes 0.8, perspectives 0.5, developers 0.4, modes 0.3, franchises and collections 0.3, era 0.2.

### 2. Weight the user's games

A rating becomes a signed weight **relative to that user's own mean**: `w = score(rating) −
mean(scores)`, with `score` the existing S=4 … F=0 scale from `src/lib/games.ts`. People rate
on different curves; someone who rates everything Great has said nothing by rating a game Great,
and centering makes their Perfects the signal.

- **Positives** are games with `w > 0`. Each gets `+0.5` if it has more than one closed
  `play_sessions` row (a replay is a strong signal of love).
- **Negatives** are games rated **Okay or Bad**, weighted by `|w|`, plus **dismissals** at a flat
  `0.5`. A game merely below the user's average is _not_ a negative: for someone whose mean is
  Great, a Good is not a dislike, and treating it as one would push away from games they enjoyed.
- **Unrated library games and wishlist games are left out of the taste model.** Unrated means
  unknown, not neutral. Wishlist games are wanted but unplayed, so they cannot anchor a "because
  you liked …"; they serve only as exclusions. Feeding them in as weak positives is a harness
  experiment, not a v1 behaviour.

### 3. Find taste modes (the clustering)

Taste has several distinct sides. If someone loves both Persona 5 and Celeste, the weighted
average of those vectors is a point between them, and the games nearest it are mediocre examples
of both. So **cluster the positives** and treat each cluster as a taste mode with its own
weighted centroid.

- **Algorithm:** k-means on the normalized vectors (approximately spherical k-means, i.e. cosine
  geometry), positives' weights as `sample_weight`, so a Perfect pulls its centroid harder.
- **Choosing k.** Silhouette score is undefined for `k = 1`, so: try `k` from 2 up to
  `min(6, n_positives // 3)`, keep the best silhouette, and **fall back to `k = 1`** when that best
  score is under `0.1` or there are fewer than 6 positives. Cap at 6 because each mode becomes a
  shelf on the tab.
- **Alternative the harness compares:** HDBSCAN (scikit-learn ≥ 1.3) picks its own cluster count
  and labels one-off favourites as noise. The harness decides between the two.
- `k` is a dial between two baselines worth keeping: `k = 1` is "one average taste", and one mode
  per liked game is plain item-to-item nearest neighbours.

### 4. Generate candidates

Per user, the union of:

1. `similar_games` of every positive.
2. Per taste mode, one IGDB query for games sharing its most common genre and theme ids, on the
   user's platforms, sorted by `total_rating_count`, limit 100.
3. **Upcoming:** games on the user's platforms with `first_release_date > now`, or no date and
   `hypes > 0`, sorted by `hypes`, limit 200.

Then drop:

- games already in the library or on the wishlist (on `igdb_id`, via `game_metadata`)
- dismissed games
- games on none of the user's platforms. "The user's platforms" is the set of `played_games.system`
  values; those are IGDB platform names whenever the game came from search, so the check is a plain
  name intersection with the candidate's `platforms`. A hand-typed system that matches nothing is
  ignored. **If none of the user's systems match, skip this filter** rather than return nothing.
- a `game_type` outside the kept set in the fields table (DLC, bundles, ports, mods, episodes)
- remakes, remasters and expanded versions of games already in the library
- released games with `total_rating_count < 5`, too obscure for a trustworthy prior

Fetching every candidate id into the feature cache is a handful of requests (500 ids each), and
the cache is shared, so later users are cheaper.

### 5. Score

For candidate `c` with normalized vector `v`:

```
relevance(c) = max over modes m of  cos(v, μ_m)        # nearest taste mode
penalty(c)   = max over negatives d of  w_d · cos(v, d)
prior(c)     = quality prior, scaled to [0, 1]
score(c)     = relevance − λ · penalty + β · prior
```

- `max` over modes rather than a mean is the point of step 3: a candidate only has to fit one side
  of your taste. Its argmax is also the candidate's `mode`.
- **Released prior:** the Bayesian average `(n·R + m·C) / (n + m)`, with `R` the game's
  `total_rating`, `n` its count, `C` the mean rating across the cache and `m = 20`. A 98 from 3
  votes should not outrank an 88 from 3,000.
- **Upcoming prior:** `log(1 + hypes)`, scaled by the largest in the pool.
- The two sections are ranked **separately and never compared**: an unreleased game has sparse
  IGDB data and would lose to any released game on relevance alone.
- Starting values: `λ = 0.5`, `β = 0.15`.

### 6. Rerank for variety (MMR)

Pure score order tends to return ten near-identical games. **Maximal marginal relevance** builds
each section's list greedily, each time picking

```
argmax over remaining c of   α · score(c) − (1 − α) · max over chosen s of cos(c, s)
```

with `α = 0.7`, plus one hard rule: at most 2 games from one franchise. **Sizes:** 24 released and
8 upcoming. A mode left with no games simply gets no shelf.

### 7. Explain

Each rec's `because` is the 2 or 3 positives with the highest `w · cos(c, game)`, drawn from its
own mode for a released game and from all positives for an upcoming one. Each mode's heading in
`recommendation_runs.modes` is the 3 positives nearest its centroid. On the tab that reads
"Because you liked Hades, Dead Cells and Celeste".

## Evaluation harness

`api/recommender/evaluate.py`, run locally against a snapshot. This is where "it seems fine"
becomes numbers, and the only place parameters get tuned.

- **Leave-one-out.** For each positive: remove it from the profile, run the pipeline, and record
  where the held-out game ranks. Report two numbers, because they measure different things:
  - **end-to-end**: it must be found by candidate generation _and_ survive the filters, otherwise
    it counts as a miss. This is the one that matters.
  - **ranking only**: it is injected into the candidate pool, isolating the scorer from recall.
- **Leave-one-franchise-out** as well, since holding out one Zelda while three others stay in the
  profile flatters the model.
- **Metrics:** hit rate at 10 and 24, and mean reciprocal rank.
- **Baselines on the same splits:** random, quality prior only, `similar_games` ordered by how many
  positives list it, `k = 1`, and one mode per liked game. A component that does not beat the
  baselines does not ship.
- **Tuning:** a small random search over block weights, `λ`, `β`, `α`, and k-means vs HDBSCAN,
  maximizing end-to-end MRR. **Beware overfitting:** one library of ~150 games is most of the data,
  so prefer the starting values unless a change wins by more than the run-to-run noise across
  folds. Winning values go in `api/recommender/params.py`, with the report that justified them
  committed beside it.

## Batch job

- **Code:** `api/recommender/` (`featurize.py`, `taste.py`, `candidates.py`, `score.py`,
  `pipeline.py`, `run.py`, `evaluate.py`, `params.py`), run as `uv run python -m recommender.run`
  from `api/`. It reuses `app.services.igdb`'s query and token-cache seam and `app.core.db`.
  **Nothing in `app/` imports `recommender`.** Add `/api/recommender/` to `.vercelignore`, whose
  rule is "does a running function read this file"; it never does.
- **Dependencies:** a `recommender` group in `api/pyproject.toml` (scikit-learn, numpy, scipy).
  `ci.yml` installs it with `uv sync --group recommender` so the pipeline's tests run in CI.
- **Workflow:** `.github/workflows/recommendations.yml`, nightly cron plus `workflow_dispatch` for
  a manual run (a new user who just rated their library). `concurrency: recommendations` so a
  manual run never overlaps the cron. `timeout-minutes: 20`.
- **Credentials: a new GitHub environment, `recommendations`, with no approval gate.** The two
  existing ones cannot serve: `production` carries the owner-role `DATABASE_URL` behind a required
  reviewer, so a nightly run would sit waiting for approval, and `production-deploy`'s role is
  read-only. The new environment holds:
  - a `DATABASE_URL` for a **dedicated Postgres role**: `SELECT` on `profiles`, `played_games`,
    `play_sessions`, `wishlist_games`, `game_metadata` and `recommendation_dismissals`; read and
    write on `igdb_game_features`, `recommendations`, `recommendation_runs` and `igdb_tokens`
    (the shared token cache). Least privilege, because this credential is used unattended every
    night. The `CREATE ROLE` and `GRANT`s go in the migration, without a password, which is set by
    hand as in `docs/deployment.md`.
  - the IGDB client id and secret the API already uses.
- **Per run:** load eligible users. Delete runs and recommendations for users no longer eligible.
  Refresh stale feature rows, run the pipeline per user, and replace their rows. One user's
  failure is logged and skipped, never fatal; the job exits non-zero at the end if any user
  failed, so a broken night shows red in Actions.

### How the site sees a new run

Library reads are `force-cache` until a write calls `revalidateTag`, and the job is not a write the
site knows about. The recommendations fetch therefore uses **time-based revalidation**,
`next: { revalidate: 3600, tags }`, instead of `force-cache`: a new run shows up within an hour
on the next visit. (`fetchWithTimeout` grows an option for this. Next warns when `force-cache` and
`revalidate` are both set, so it is one or the other.)

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

Both new endpoints go in the Bruno collection (`api/bruno/`); `test_bruno_collection.py` fails
otherwise.

## Frontend

### Fetching

`LibraryPage.tsx` gains a sixth read in its `Promise.all`, beside games, wishlist, sessions,
followers and following. That keeps the `CLAUDE.md` rule that nothing the library shows is
fetched from the browser afterwards, so the tab has no loading state.

**Tagging, chosen so no existing write needs editing.** The read carries `libraryCacheTag`,
`gamesTag`, `wishlistTag`, and a new `recommendationsTag`. Every library and wishlist write already
revalidates one of the first three, and each of those writes can change this read (the anti-join,
or the eligibility count after a rating edit). Only the two dismissal writes revalidate
`recommendationsTag` itself. The cost is that a rating edit also refetches recommendations, one
indexed query.

### The tab

- `GameView` in `libraryConfig.ts` becomes `"played" | "wishlist" | "recommendations"`.
  **`GameShelves.tsx` has several binary `view === "played" ? … : …` ternaries** (the empty check,
  the active total, the add-button target). Each needs a third answer, not a silent fall-through
  to the wishlist branch.
- The filter, group and sort pipeline does not apply: the order is the ranking and the grouping is
  the taste modes. The sticky header keeps the tabs and hides `FilterBar` on this view.
- **Layout:** an **Upcoming** shelf on top, then one shelf per taste mode headed "Because you
  liked …", rendered with the **active theme's shelf group** (`SHELF_GROUPS`). A recommendation
  fits `GameCaseInput` with `id` set to `igdbId` and `system` set to `""`, so the shelf, the
  theme and `GameCase` are reused rather than forked, as the shelf-theme convention requires.
- **Visibility:** visitors see the tab only when `status` is `ready` and a list is non-empty. The
  owner always sees it, with the empty states:
  - `needs_ratings`: "Rate N more games to get recommendations."
  - `pending`: "Your first recommendations arrive overnight."
  - `ready` but empty: "Nothing new to recommend right now. Check back tomorrow."
- **Actions, owner only:** **Add to wishlist** and **Not interested**, both of which create a row
  and so gate on `useIsConfirmedOwner`, never `useIsLikelyOwner`. Dismissing hides the game
  optimistically and leaves an inline **Undo** in its slot until the page is left; there is no
  site-wide toast yet (see the backlog's **Show a confirmation toast after logging a session**).
- Copy follows the no-em-dash rule, and every surface supports light and dark mode.

New: `src/lib/recommendations.ts` (types), `src/components/video_games/RecommendationsView.tsx`,
and server actions `dismissRecommendation` / `undoDismissRecommendation` in
`video-games/actions.ts`.

## Testing

- **Pipeline (pytest, no network):** block norms; rating centering; that Okay and Bad are
  negatives and a below-average Good is not; the `k` fallback to 1; that max-over-modes prefers a
  game near one mode to a game between two; the franchise cap; and the prior's ordering (98 from
  3 votes below 88 from 3,000).
- **Read and writes (DB-gated, as today):** the three statuses and the eligibility edge (ten
  identical ratings is `needs_ratings`); the read-time anti-joins; dismissal idempotence and the
  404 for an unknown id; and that no public payload carries the dismissals.
- **Frontend (`node --test`):** the pure helpers, such as grouping released recs by mode and
  building the "Because you liked" sentence.

## Docs to update when this lands

Per the ownership rule in `CLAUDE.md`: the four tables and their reasoning in `api/README.md`'s
data model; the batch path and the time-based revalidation in `docs/architecture.md`; the new
environment, role and workflow in `docs/deployment.md`; and new rows in `CLAUDE.md`'s "Where
things live" table.

## Phases

1. **Prove the algorithm.** A local script pulls the library and IGDB features into memory, then
   featurize, taste, score, MMR and the harness. No migration, no UI. This is where the
   algorithm question actually gets answered, and it is cheap to throw away. **Exit criterion:**
   the pipeline beats every baseline on end-to-end MRR.
2. **Persist.** The migration (tables, role, grants), the feature-cache fetcher, `run.py`, the
   workflow and its environment.
3. **Read and tab.** The endpoint, `fetchRecommendations`, the tab, empty states.
4. **Feedback.** Dismiss and undo, add to wishlist.

## Open questions

- **Tapping a recommendation.** `GameCase` opens the detail card through `LibraryCardContext`.
  Either the recommendations view supplies a context whose `openCard` does nothing and the actions
  sit on the case, or the card gets a read-only recommendation face with the actions on it. The
  second matches the rule that the card is the owner edit surface; the first is far less work.
  Decide at the start of phase 3.
- **IGDB terms.** Confirm that a cached copy of IGDB data and any required attribution fit their
  terms, as the catalog already relies on.

## Explicitly not in v1

- Collaborative filtering.
- An LLM in any role. It was considered for the explanation line and declined.
- A supervised model predicting ratings from features (ridge or logistic regression). A good
  phase-2 experiment, since the harness can score it against clustering on the same splits.
- Wishlist games as positive signal (a harness experiment first).
- Recompute on every rating change. Nightly plus a manual run is enough.
- Pruning the feature cache.
