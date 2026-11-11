# Game recommender

"Based on the games you've played and liked, you should try …": a third library tab beside Played
and Wishlist, filled by an offline job that ranks IGDB games against each user's ratings.

**The design is [`docs/specs/recommendations.md`](../../docs/specs/recommendations.md).** This file
owns where the work stands and how to pick it back up; the spec owns why and how it works. Link,
don't restate.

## Why it exists

The library records what you played and how you rated it, but nothing turns that into "what next".
The spec settles the shape of the answer:

- **Content-based, not collaborative.** The site has a handful of users, far too few for "people
  like you also liked". Each game is a feature vector built from IGDB data (genres, themes,
  keywords, developers, era, …), your taste is learned from your ratings, and unowned games are
  ranked by how close they are to it.
- **Clustered into taste modes.** Someone who loves both Persona 5 and Celeste has two tastes, and
  their average recommends neither well. Clustering the liked games gives one shelf per mode.
- **Offline.** scikit-learn is too large for the deployed function, so a nightly GitHub Actions job
  writes a table that the API only reads. Nothing in `app/` imports this package.

## Tracking

- **Backlog entry:** "A Recommendations tab beside Played and Wishlist" in `TODO.md`, detail in
  [`docs/todo/game-recommendations.md`](../../docs/todo/game-recommendations.md). Edit it only
  through the `proj-todo` skill (`CLAUDE.md` requires that). When a phase lands, update the entry's
  status line; when all four have shipped, the skill removes the entry.
- **Phases 1 to 4:** the spec's [Phases](../../docs/specs/recommendations.md#phases) section.
- **This README's Status section** is the one to keep current as steps finish.

## Status

**Phase 1 of 4, in progress** (draft PR #224, branch `recommender/phase1-notebook`). Phase 1 proves
the algorithm locally, in a notebook plus an evaluation harness, before any migration or UI exists.
It is cheap to throw away if the answer is no.

| Phase 1 step                                  | State                                   |
| --------------------------------------------- | --------------------------------------- |
| Snapshot: library + IGDB features + pool      | Done (`library.py`, `snapshot.py`)      |
| Resolve ports and bundles to their main games | Done (`versions.py`), added to the spec |
| Featurize                                     | Next                                    |
| Taste modes (weighted k-means)                | Not started                             |
| Pool filters, scoring, MMR rerank             | Not started                             |
| Evaluation harness, baselines                 | Not started                             |

**Exit gate for phase 1:** with its starting parameters, the pipeline beats every baseline on
end-to-end MRR (mean reciprocal rank, in leave-one-out over the liked games). Phases 2 to 4
(persist, read and tab, feedback actions) are in the spec's
[Phases](../../docs/specs/recommendations.md#phases) section.

### What the data showed so far

On the founder's library (163 games, all rated and IGDB-backed):

- 64 positives after centering on the mean rating, enough for clustering to choose 2 to 6 modes.
- Keywords, the richest feature, are on 98% of games with a median of 20.
- **Recall ceiling: 60 of 64.** Held out one at a time, 60 liked games are still in the candidate
  pool. Two misses sit below their platform's popularity cutoff (Pikmin 4, TowerFall Ascension),
  two are too niche for any pool (Dokapon Kingdom, Dance Central).

### Decided, not built yet

- A bundle rated once (Ace Attorney Trilogy) stands for several main games; its weight is split
  evenly across them, so one rating does not count three times.

### Experiments once the harness exists

- "Good" is 42% of the library and below the mean, so the spec ignores it. Try it as a weak positive.
- Raise the popular pool above 500 per platform, which would reach the two cutoff misses at the
  cost of more competition in ranking.

## Running it

```sh
cd api
uv sync --group recommender --group notebook

# The library comes from the public read, so no database credentials are involved.
mkdir -p recommender/snapshot
curl -s https://rgrassian.com/api/library/users/rgrassian/games    > recommender/snapshot/games.json
curl -s https://rgrassian.com/api/library/users/rgrassian/wishlist > recommender/snapshot/wishlist.json

# IGDB side: ~21 requests, needs TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET in the repo-root .env.
uv run python -m recommender.snapshot
```

Then open `api/notebooks/recommendations.ipynb` in VS Code (Jupyter extension, kernel `api/.venv`)
and Run All. Clear outputs before committing; `snapshot/` is gitignored.

A bare `uv sync` uninstalls the two groups because they are not defaults; `uv run` leaves them.

## Layout

| File                             | What                                                                  |
| -------------------------------- | --------------------------------------------------------------------- |
| `library.py`                     | A library loaded from the public read's JSON; eligibility             |
| `snapshot.py`                    | Fetches IGDB features for the library, its similar games and the pool |
| `versions.py`                    | Port and bundle → main game resolution                                |
| `../notebooks/`                  | Exploration only; logic lives in these modules so pytest can reach it |
| `../tests/test_recommender_*.py` | Tests, no network                                                     |

The algorithm modules the spec plans (`featurize.py`, `taste.py`, `pool.py`, `score.py`,
`pipeline.py`, `evaluate.py`, `params.py`, `run.py`) do not exist yet.
