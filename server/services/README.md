# RSSMonster Semantic Architecture

```text
Article → embedding → semantic duplicate handling → Event
behavioral Article evidence → Interest Island
candidate Article vector → direct Island evidence → interestScore → Recommended
```

Articles preserve content identity, revisions and user behavior. Events group
reports about one real-world occurrence. Interest Islands are persistent,
user-specific behavioral preferences; an Event association alone is not a
personal preference. Recommended combines optional personalization with existing
freshness, quality, FeedTrust and Event-derived signals.

## Processing and ownership

The crawl worker performs extraction, deterministic identity, normalization,
revision handling, duplicate/filter handling and persistence before semantic
processing. Embeddings precede Event assignment/reconciliation and interest
scoring. Read the [crawl guide](crawl/README.md) for stage-specific behavior.

`reconcile/semanticPipelineScopes.js` owns incremental, recent repair and historical
Event backfill scopes. `events/assignArticleToEvent.js` selects bounded eligible
candidates; creation and updates preserve transactional membership, source
corroboration, Event vectors, lifecycle and representative/developing pointers.
Occurrence decisions are shared across retrieval paths. Eventless is valid.
See [Events](events/README.md).

`islands/runIslandCalibration.js` builds behavioral profiles, persists Islands and
rescores unread articles. A normal crawl scores new articles against existing
Islands. Favorites, explicit feedback, clicks and attention remain the evidence;
audit entries and previous scores never become new behavioral input.
See [Interest Islands](islands/README.md).

Article embedding input strips recognized editorial prefixes only when followed
by a delimiter, such as `Video |`, `Explainer:`, or `Live —`. The headline after
the prefix is retained, including meaningful pipe/dash clauses. Bare words such
as `Live music` and words beginning with a prefix, such as `Liverpool`, stay intact.
Without publisher metadata, a trailing pipe/dash segment cannot safely be treated
as a source suffix. Existing stored vectors are reused; applying the revised input
recipe to historical vectors requires a separately scoped regeneration operation.

All candidates, source evidence, related articles and mutations must preserve
user ownership and existing visibility rules. Deterministic article identity
takes precedence over semantic similarity; similar content is not necessarily
a duplicate or the same occurrence.

## Storage and consistency

`Article.eventId` is the membership source of truth. Event projections summarize
canonical members and retain valid representative/developing article pointers.
Islands store signed preference, vector, behavior snapshots and bounded audits.
Candidate Article affinity and confidence are derived at evaluation time.

Managed Event writes update in-memory caches only after commit. Optional generated
Event/Island display labels are enqueued after their owned targets exist, using
identifier-only durable jobs. Label failures retain deterministic names. Article
analysis and label jobs can run separately from the critical crawl pipeline.

## Recommendation contract

`islands/islandInterestConfidence.js` is shared by persisted scoring and read-time
explanations. It separates signed preference, confidence in behavioral support,
and confidence in direct semantic similarity. Bounded explicit feedback fallback
preserves likes/dislikes when no same-sign Island represents the evidence.
Strongest positive and strongest negative paths combine without correlated sums.

Every eligible canonical visible Article receives a finite runtime Recommended
score. No Event, Island, vector or nonzero interest is required. Unmatched interest
is zero; absent Event corroboration is zero. Final Recommended weights are unchanged.
See [scoring](../../docs/scoring.md), [search](articleSearch/README.md), and
[semantic validation](../tests/semantic/README.md).

## Maintenance

`npm run recommendations:evaluate -- --userId=1` runs a read-only evaluation of
the latest 1,000 eligible Articles by `publishedAt DESC, id DESC`.
`npm run recommendations:recalculate -- --userId=1` uses the same selection and
persists only `interestScore` and `interestScoredAt`. Recommended itself remains
a runtime value. Both commands use the current active Islands and production
behavioral fallbacks without calibration, Event repair, labeling or embedding calls.

Use `--status=unread` to select **all** eligible unread Articles, processed in
200-Article batches. An explicit `--limit=1000` caps this selection. `--status=all`
(the default) or `--status=read` defaults to 1,000; `--limit=N` overrides it.
Filtered Articles, canonical duplicates and legacy duplicate-status rows are
excluded before the limit. Missing/incompatible vectors remain eligible with neutral
interest. A required positive `--userId` prevents accidental cross-user runs.

Reports are streamed to ignored `server/reports/recommendations/<run>/` when run
from `server/`; `--output=directory` selects another directory. `summary.json`
records completion/failure, selection, current Island IDs/confidence, score counts
and zero reasons. `articles.jsonl` records stored/recomputed interest, Island-only
interest, Recommended breakdowns, supporting Island IDs and full scoring diagnostics.
No vectors are exported. Island-only results are diagnostic; recalculation always
persists the full production interest result. Before/after Recommended values use
the same current non-interest inputs, not historical scores.

Recalculation locks selected targets and commits one batch at a time. Unchanged
scores receive a fresh evaluation timestamp; newer existing evaluations are skipped.
A failed/interrupted command may have committed earlier batches; partial reports
are marked failed/running, never complete. New arrivals beyond the initial maximum
Article ID are excluded. This is a live maintenance scan, not a database-wide snapshot:
concurrent publication/status edits can change eligibility between batches. Evidence
is loaded once for the run. Reports describe today's memory applied to old Articles,
including possible training sources, not a held-out historical backtest.

Use the existing incremental, recent-repair and historical-backfill services.
Do not build parallel reconciliation pipelines or perform production rebuilds as
part of a routine crawl. Model changes require an explicitly requested rebuild;
matching vector dimensions alone do not establish embedding-space compatibility.
Before/after semantic comparisons keep model, vectors and corpus constant and
report memberships, held-out outcomes, finite coverage, failures and runtime.

### Embedding-space compatibility

Semantic comparisons require matching, non-empty `embedding_model` identifiers
and equal dimensions, including the 0.99 duplicate fallback, Events, Islands,
taxonomy names and Article recommendations. The shared `vectors/embeddingModel.js`
helper rejects unknown or incompatible provenance before numerical comparison.
Unknown vectors are not assigned the configured model on reuse. Model changes
require explicit re-embedding; this check does not rebuild or backfill data.
