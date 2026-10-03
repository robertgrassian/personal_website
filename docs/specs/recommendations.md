# Tech spec: game recommendations

Status: **proposed**, 2026-10-03. Not started.

"Based on the games you've played and liked, you should try …", as a third library tab beside
Played and Wishlist: a short **Upcoming** row and a longer **Released** section.

## Decisions already made

| Question            | Answer                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who gets them       | Every user with enough rated games (threshold below).                                                                                                     |
| Who sees them       | Everyone. A public tab, served on the existing cached public read path. Recommendations derive only from public fields, so they are not viewer-dependent. |
| Feedback in v1      | Both **Add to wishlist** and **Not interested**.                                                                                                          |
| LLM                 | **None.** Ranking is deterministic math; explanations are templated from the nearest rated games.                                                         |
| Where the math runs | **Offline**, in a scheduled batch job, never in the API function. See [Why offline](#why-offline).                                                        |
| Algorithm family    | **Content-based**, not collaborative filtering. See [Why content-based](#why-content-based).                                                              |

## Why content-based

Collaborative filtering ("people whose libraries overlap with yours also liked …") needs many users
with overlapping libraries. This site has a handful, so the matrix it factorizes would be almost
all empty. Content-based recommendation needs only one user's library plus a description of every
game: represent each game as a feature vector, represent the user's taste in the same space, and
rank unowned games by closeness.

Collaborative filtering becomes viable only if the user base grows by orders of magnitude. The
pipeline below keeps a seam for it (a second scorer whose output is blended), but v1 does not
build it.

## Why offline

- **Size.** scikit-learn + numpy + scipy is well over 100MB installed. The deployed Python function
  installs `[project].dependencies` from `api/pyproject.toml`; adding them there would bloat every
  cold start of every library read.
- **Time.** A run makes dozens of IGDB requests (rate limit: 4/s) and fits a model per user. That
  has no business on a request path.
- **Shape.** The output changes at most daily. A precomputed table read through the existing cache
  is the right fit.

So the recommender is a **batch job** on a GitHub Actions cron, writing to Postgres. The API only
reads rows. The heavy dependencies live in a new `recommender` dependency group (like `dev`), which
the deployed function never installs.

## Data sources

### Candidates come from IGDB, not from `game_metadata`

`game_metadata` holds only games that some user has already added, which are by definition the
games least worth recommending to them. Candidates have to come from IGDB.

### Features come from IGDB for both sides

The library side has Wikipedia-sourced genres, which are better than IGDB's for _display_ (see
`api/README.md`). But a candidate has only IGDB data, and a similarity is meaningless if the two
vectors are built from different vocabularies. **Every vector, library game and candidate alike,
is built from IGDB fields.** Hand-entered games (no `igdb_id`) have no IGDB features and are left
out of the taste model; they are rare and this is acceptable.

IGDB fields used, all available on the `games` endpoint already queried by `services/igdb.py`:

| Field                      | Use                                                                 |
| -------------------------- | ------------------------------------------------------------------- |
| `genres`, `themes`         | Multi-hot feature blocks                                            |
| `player_perspectives`      | Multi-hot (first-person, isometric, side view …)                    |
| `game_modes`               | Multi-hot (single player, co-op …)                                  |
| `keywords`                 | TF-IDF feature block; the richest signal and the noisiest           |
| `involved_companies` (dev) | Multi-hot, sparse                                                   |
| `franchises`, `collection` | Multi-hot, sparse                                                   |
| `first_release_date`       | Era bucket feature; also the released / upcoming split              |
| `similar_games`            | **Candidate generation only**, never a feature                      |
| `total_rating`, `_count`   | Quality prior for released games                                    |
| `hypes`                    | Quality prior for upcoming games                                    |
| `platforms`                | Candidate filter: only platforms the user has played on             |
| `game_type`                | Filter out DLC, bundles, ports and remasters of games already owned |

## Data model

Three new tables, one Alembic migration.

### `igdb_game_features`: the feature cache

Every IGDB game the recommender has looked at, library and candidate alike. **Deliberately not
`game_metadata`**: that table means "a game somebody holds" and is refreshed on read by
`catalog_refresh.py`. Thousands of candidate rows there would change both meanings.

| Column                                        | Type                      | Notes                                                  |
| --------------------------------------------- | ------------------------- | ------------------------------------------------------ |
| `igdb_id`                                     | `int` PK                  |                                                        |
| `name`, `cover_url`                           | `text`                    | Display data for the tab, so the read never calls IGDB |
| `first_release_date`                          | `date` NULL               |                                                        |
| `platform_ids`                                | `int[]`                   |                                                        |
| `features`                                    | `jsonb`                   | Raw id lists per field (genres, themes, keywords, …)   |
| `similar_games`                               | `int[]`                   |                                                        |
| `total_rating`, `total_rating_count`, `hypes` | `real`, `int`, `int` NULL |                                                        |
| `fetched_at`                                  | `timestamptz`             | Re-fetched when older than 7 days (upcoming: 1 day)    |

No FK to anything, and no user data, so no privacy concern and nothing cascades.

### `recommendations`: the job's output

| Column         | Type                                     | Notes                                                                         |
| -------------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| `user_id`      | `uuid` FK `profiles` `ON DELETE CASCADE` |
| `igdb_id`      | `int` FK `igdb_game_features`            |
| `section`      | `text` CHECK in (`released`, `upcoming`) |
| `rank`         | `smallint`                               | Order within the section after reranking                                      |
| `score`        | `real`                                   | Kept for debugging and the eval report; not displayed                         |
| `mode`         | `smallint`                               | Which taste mode it belongs to; the tab groups released recs by this          |
| `because`      | `bigint[]`                               | `played_games.id` of the 2 or 3 nearest rated games, for the explanation line |
| `generated_at` | `timestamptz`                            |                                                                               |

PK `(user_id, igdb_id)`. The job replaces a user's rows in **one transaction** (delete, then
insert) so a reader never sees half a run.

`because` stores library row ids rather than names so a rename or a catalog merge shows through.
A deleted library game just drops out of the explanation at read time.

### `recommendation_dismissals`: "Not interested"

| Column       | Type                                     | Notes                              |
| ------------ | ---------------------------------------- | ---------------------------------- |
| `user_id`    | `uuid` FK `profiles` `ON DELETE CASCADE` |                                    |
| `igdb_id`    | `int`                                    | No FK: the cache row may be pruned |
| `created_at` | `timestamptz`                            |                                    |

PK `(user_id, igdb_id)`. Owner-only: no public route reads it directly, though its _effect_ (the
game vanishing from the public tab) is visible to anyone, which is correct.

## The algorithm

The pipeline is a pure function per user, `recommend(library, wishlist, dismissals, features) →
rows`, with all I/O outside it. That is what makes it testable without the network and runnable in
a notebook.

### 1. Featurize

Each game becomes one sparse vector made of **blocks**, one block per field in the table above:

- Multi-hot blocks for genres, themes, perspectives, modes, developers, franchises.
- A TF-IDF block for keywords, with IDF fitted over the whole feature cache, so a rare keyword
  ("metroidvania") carries more weight than an everywhere one ("open world"). `min_df=3` drops
  keywords too rare to compare on.
- A one-hot era block (5-year buckets).

**Each block is L2-normalized, then multiplied by a block weight.** Without the normalization,
the keyword block (hundreds of columns) would swamp the perspective block (a handful) by sheer
dimension count. The block weights are hyperparameters, tuned by the evaluation harness, not by
hand. Starting values: keywords 1.0, genres 0.8, themes 0.8, perspectives 0.5, modes 0.3,
developers 0.4, franchises 0.3, era 0.2.

### 2. Weight the user's games

A rating becomes a signed weight **relative to that user's own mean**: `w = score(rating) −
mean(scores)`, where `score` is the existing S=4 … F=0 scale from `src/lib/games.ts`. People
rate on different curves. Someone who rates everything Great has told us nothing by rating a game
Great, and centering makes their Perfects the positives and their Okays the negatives.

Small adjustments, each capped so no single one dominates:

- **Replays** (more than one closed `play_sessions` row) add +0.5.
- **Wishlist** games join as weak positives at +0.5. They are wanted but unplayed.
- **Dismissals** join as weak negatives at −0.5. "Not interested" is not "I played it and hated it",
  and may mean "I already played it and never logged it".
- Unrated library games are excluded. Unrated means unknown, not neutral.

**Threshold:** a user gets recommendations once they have **10 rated IGDB-backed games with at
least 3 positive weights**. Below that the tab shows how many more ratings it needs.

### 3. Find taste modes (the clustering)

Taste has several distinct sides. If someone loves both Persona 5 and Celeste, the
weighted average of those vectors is a point between them, and the games nearest it are mediocre
examples of both. So **cluster the positively-weighted games** and treat each cluster as a separate
taste mode with its own (weighted) centroid.

- **Algorithm:** k-means on L2-normalized vectors (approximately spherical k-means, i.e. cosine
  geometry), with `k` from 1 to 8 picked by silhouette score. Positive weights become
  `sample_weight`, so a Perfect pulls its centroid harder than a Great.
- **Alternative to compare against:** HDBSCAN (in scikit-learn since 1.3). It picks the number of
  clusters itself and labels outliers as noise, which suits "a one-off game I loved". The eval
  harness decides between them; the spec does not.
- `k` is a dial between two baselines worth keeping in the harness: `k = 1` is "one average taste",
  and `k = n` (each liked game its own mode) is plain item-to-item nearest neighbors.

### 4. Generate candidates

Per user, the union of:

1. `similar_games` of every positively-weighted game (IGDB's own neighbors: high recall, cheap).
2. For each taste mode, one IGDB query on its top 3 genre and theme ids, sorted by
   `total_rating_count`, limit 100.
3. **Upcoming only:** unreleased games (`first_release_date > now`, or no date with status
   "announced") on the user's platforms, sorted by `hypes`, limit 200.

Then filter out:

- games already in the library or the wishlist (matched on `igdb_id` via `game_metadata`)
- dismissed games
- games not on any platform the user has played on (`played_games.system` mapped to IGDB platform
  ids with the alias map `services/igdb.py` already builds)
- DLC, bundles and ports via `game_type`
- released games with `total_rating_count < 5`, which are too obscure to have a trustworthy prior

All candidate ids are fetched into `igdb_game_features` in batches of 500 (one request each), so
a user's run costs on the order of 10 requests and the shared cache makes later users cheaper.

### 5. Score

For candidate `c` with normalized vector `v`:

```
relevance(c) = max over modes m of  cos(v, μ_m)       # nearest taste mode
penalty(c)   = max over negatives d of  |w_d| · cos(v, d)
prior(c)     = Bayesian-averaged quality, scaled to [0, 1]
score(c)     = relevance − λ · penalty + β · prior
```

- `max` over modes rather than a mean is the point of step 3: a candidate only has to fit one side
  of your taste.
- The **Bayesian average** for released games is `(n·R + m·C) / (n + m)`, where `R` is the game's
  `total_rating`, `n` its count, `C` the mean rating across the cache and `m = 20`. A 98 from 3
  votes should not outrank an 88 from 3,000. For upcoming games the prior is `log(1 + hypes)`,
  normalized.
- Starting values: `λ = 0.5`, `β = 0.15`. Tuned by the harness.

### 6. Rerank for variety (MMR)

Pure score order tends to return ten near-identical games. **Maximal marginal relevance** builds
the list greedily, each time picking

```
argmax over remaining c of   α · score(c) − (1 − α) · max over chosen s of cos(c, s)
```

with `α = 0.7`. Two more rules: at most 2 games from one franchise, and every mode gets at least
one slot if it has a candidate above a floor score.

**Sizes:** 24 released and 8 upcoming.

### 7. Explain

Each rec stores the 2 or 3 rated games from its mode with the highest `w · cos(c, game)`, so
the explanation is "Because you liked Hades, Dead Cells and Celeste". The tab groups released recs
by mode, so in practice the explanation is a shelf heading.

## Evaluation harness

This is what turns "it seems fine" into numbers, and it is where tuning happens.
`api/recommender/evaluate.py`, run locally against a database snapshot, never in CI:

- **Leave-one-out.** For each of a user's positively-weighted games: remove it from the profile,
  add it to the candidate pool, run the pipeline, and record where it ranks.
- **Metrics:** hit rate at 10 and 24, and mean reciprocal rank.
- **Baselines, all scored on the same splits:** random, quality prior only, IGDB `similar_games`
  ordered by frequency, `k = 1` centroid, `k = n` nearest neighbors. A feature that does not beat
  the baselines does not ship.
- **Tuning:** a grid or random search over block weights, `λ`, `β`, and k-means vs HDBSCAN,
  optimizing MRR. The chosen values are committed to `api/recommender/params.py` alongside the
  report that justified them.

Leave-one-out flatters the model a little, because a held-out game is in its own franchise's
neighborhood. The harness should also report a variant that holds out the whole franchise.

## Batch job

- **Code:** `api/recommender/` (`featurize.py`, `taste.py`, `candidates.py`, `score.py`,
  `pipeline.py`, `run.py`, `evaluate.py`, `params.py`). It reuses `app.services.igdb` for the
  token cache and the query seam, and `app.core.db` for sessions. **Nothing in `app/` imports
  `recommender`**, so the function bundle carries a few small source files and none of the
  dependencies.
- **Schedule:** `.github/workflows/recommendations.yml`, a nightly cron plus `workflow_dispatch`
  for a manual run (e.g. a new user who just rated their library). It uses the `DATABASE_URL`
  secret `deploy.yml` already has, plus the IGDB credentials and a revalidation secret.
- **Per run:** load every eligible user, refresh stale feature rows, run the pipeline per user,
  replace their rows, then revalidate their cache tag. One user's failure is logged and skipped,
  never fatal to the run.
- **Cache revalidation.** Library reads are `force-cache` until a `revalidateTag`
  (`src/lib/libraryApi.ts`), and the job runs outside Next.js, so it needs a door in: a new
  route handler `POST /api/revalidate` that checks a shared secret header and calls
  `revalidateTag(recommendationsTag(username))`. It accepts a username list, not arbitrary tags.

## API

### Read (public, cached)

`GET /api/library/users/{username}/recommendations`

```json
{
  "generated_at": "2026-10-03T06:12:00Z",
  "status": "ready", // or "needs_ratings" | "pending"
  "ratings_needed": 0,
  "upcoming": [
    {
      "igdb_id": 1,
      "name": "…",
      "image_url": "…",
      "release_date": "2027-02-01",
      "because": ["Hades", "Dead Cells"]
    }
  ],
  "released": [{ "igdb_id": 2, "…": "…", "mode": 0 }],
  "modes": [{ "mode": 0, "because": ["Hades", "Dead Cells", "Celeste"] }]
}
```

The read **anti-joins the library, the wishlist and the dismissals at read time**, as well as at
batch time. That is what makes a wishlist add or a dismissal take effect immediately instead of
the next night.

- `needs_ratings`: below the threshold; `ratings_needed` says how many more.
- `pending`: eligible, but the job has not run for them yet.

Layers as usual: `routers/users.py` → `services/recommendations.py` → `repositories/recommendations.py`.

### Writes (owner-only, `/me`)

- `POST /api/library/me/recommendations/dismissals` with `{ "igdb_id": … }`, idempotent.
- `DELETE /api/library/me/recommendations/dismissals/{igdb_id}` to undo.
- **Add to wishlist** reuses `POST /me/wishlist` with the `igdb_id`. Since 2026-09-23, a new IGDB
  row trusts nothing from the payload but the id, so nothing new is needed on the server.

Add both endpoints to the Bruno collection in `api/bruno/`; `test_bruno_collection.py` fails
otherwise.

## Frontend

### Fetching: one more read in the `Promise.all`

`LibraryPage.tsx` gains a sixth read beside games, wishlist, sessions, followers and following.
That keeps the rule in `CLAUDE.md`: nothing the library shows is fetched from the browser
afterwards, so the tab has no loading state.

- `libraryApi.ts`: `fetchRecommendations(username)` and `recommendationsTag(username)`.
- **Tag pairing** in `video-games/actions.ts`. The recommendations tag must be revalidated by:
  dismiss, undo-dismiss, add to wishlist, delete from wishlist, add a library game, delete a
  library game, and promote. Every one of those changes the read-time anti-join.

The payload is small (32 rows of name, cover URL and date). Measure it against the 54KB games
payload once real, the same check that settled the play history read.

### The tab

- `GameView` in `libraryConfig.ts` becomes `"played" | "wishlist" | "recommendations"`.
- The filter, group and sort pipeline does **not** apply to this tab: its order is the ranking,
  and its grouping is the taste modes. The sticky header shows the tabs but hides `FilterBar` on
  this view.
- **Layout:** an **Upcoming** row on top, then one shelf per taste mode, each headed "Because you
  liked …". Using the active shelf theme's group component would keep the library feeling like
  one place; that needs the group to accept a recommendation-shaped item. See open questions.
- **Actions per game,** owner only: **Add to wishlist** and **Not interested**. Both create a row,
  so both gate on `useIsConfirmedOwner`, never `useIsLikelyOwner` (see the `CLAUDE.md`
  convention).
- **Empty states:** `needs_ratings` says "Rate N more games to get recommendations" (owner) or
  hides the tab (visitor). `pending` says they are computed nightly.
- Copy obeys the no-em-dash rule. Light and dark mode both.

New files: `src/lib/recommendations.ts` (types), `src/components/video_games/RecommendationsView.tsx`,
and a server action pair `dismissRecommendation` / `undoDismissRecommendation`.

## Testing

- **Pure pipeline, pytest, no network:** fixture feature rows → assert featurization block norms,
  rating centering, that `max`-over-modes recommends a game near one mode over one between two,
  MMR's franchise cap, and the Bayesian prior ordering (98 from 3 votes ranks below 88 from 3,000).
- **Repository and service tests** for the read (the read-time anti-joins, the three statuses) and
  for dismissals, under the existing `DATABASE_URL` gating.
- **A public-read test** asserting dismissals never appear in any public payload.
- **Frontend:** `node --test` on any pure helper (mode grouping, the `because` sentence builder).

## Phases

1. **Notebook first.** Pull the library and IGDB features into a local script or notebook,
   build featurize, taste, score, MMR and the eval harness, and tune. No migrations, no UI. This
   is the phase where the algorithm question actually gets answered, and it is cheap to throw
   away.
2. **Persist.** Migration, `igdb_game_features` fetcher, `run.py`, the nightly workflow,
   the revalidation route.
3. **Read and tab.** The endpoint, `fetchRecommendations`, the tab, empty states.
4. **Feedback.** Dismiss and undo, add to wishlist, tag pairing.

## Open questions

- **Shelf reuse.** Can the theme group components in `shelves/` render a recommendation, or does
  the tab get its own grid? It depends on how tightly `GameCase` is coupled to `Game`. Decide at
  the start of phase 3.
- **Detail card.** Does tapping a recommendation open a (read-only) detail card, or are the
  actions on the case enough for v1?
- **Visitors under the threshold.** Hide the tab, or show it with an explanation? The spec says
  hide.
- **IGDB terms.** Confirm that storing a feature cache of IGDB data fits their terms of use, as the
  catalog already does.

## Explicitly not in v1

- Collaborative filtering.
- An LLM in any role. It was considered for the explanation line and declined.
- A supervised model predicting ratings from features (ridge or logistic regression). It is a good
  phase-2 experiment, since the harness can score it against clustering on the same splits.
- Real-time recompute on rating changes. Nightly, plus a manual dispatch, is enough.
