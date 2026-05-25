# Semantic Services Implementation (Server-Side)

This document describes the **current implementation** of the semantic system by looking only at `server/services/**`.

## Scope

Covered modules:

- `server/services/config/semanticConfig.js`
- `server/services/articles/*`
- `server/services/events/*`
- `server/services/topics/*`
- `server/services/islands/*`

---

## 1) High-level processing pipeline

At runtime, the semantic pipeline is effectively:

1. **Embed article text** into vectors (`embedArticle`).
2. **Assign article to an event** (`assignArticleToEvent`):
   - match against recent candidate events with a composite score,
   - otherwise create a new event.
3. **Assign event/semantic unit to topics** (`assignSemanticUnitToTopic`):
   - multi-topic ranked membership with thresholds and identity fallback,
   - optionally create a new topic if enough evidence exists.
4. **Persist link tables and denormalized fields**:
   - `articles.eventId`, `events.topicId`,
   - `article_topics`, `event_topics` (ranked confidence memberships).
5. **(Batch mode) Recluster user corpus** (`reclusterForUser`) to re-run event/topic assignment over a time window and recompute aggregate stats.
6. **Build user interest islands** (`buildInterestIslands`) from topic-level behavior signals, then write back **article interest scores** (`buildArticleInterestScoresForUser`).

---

## 2) Core entities and how they relate

### Article
- Stores raw content metadata and semantic vector (`articleVector`, `embedding_model`).
- Gets linked to exactly one event via `eventId`.
- Can belong to multiple topics through `article_topics` with `{confidence, rank, primaryInd}`.
- Receives a scalar `interestScore` from island/topic mapping.

### Event
- A cluster of semantically similar articles with temporal continuity.
- Stores centroid-like `eventVector`, lifecycle state (`emerging|active|cooling|archived`), diversity metrics, and strength.
- Has one denormalized primary `topicId`, plus many ranked topic memberships in `event_topics`.

### Topic
- Broader semantic region above event level.
- Stores `topicVector`, optional stable `topicKey`, and activity/count stats.
- Membership is many-to-many with events (`event_topics`) and articles (`article_topics`).

### Island
- User-interest profile built from topic engagement/negative feedback.
- Stores profile vector + signed/weighted topic composition.
- Joined to topics through `island_topics`.
- Feeds article ranking by propagating island weights to article topics.

---

## 3) Configuration model (semantic granularity)

`semanticConfig.js` centralizes thresholds and dynamics:

- Event/topic similarity thresholds.
- Topic assignment thresholds (`identity`, `primary`, `secondary`, max topics/article).
- Candidate scan limit and recency window.
- Event temporal gap + recency half-life.
- Auxiliary corroboration thresholds (headline/entity overlap).
- Event lifecycle cutoffs.
- Vector update alphas for topics/events.
- Event strength weighting model.

This file is the key "control plane" for tuning fragmentation vs. merge behavior and stability vs. drift.

---

## 4) Embedding stage

### `embedArticle`

Responsibilities:
- Normalize/clean title + content.
- Build two textual representations:
  - **event text** (title + leading paragraphs)
  - **topic text** (longer body excerpt)
- Call OpenAI embeddings (`text-embedding-3-small`).
- Persist article-level vector (`articleVector`) when called with an ORM article instance and `persist=true`.

Notable behavior:
- If `article.articleVector` already exists, it reuses and skips API call.
- If API key is missing, it safely skips.
- Event embeddings enforce minimum length; short/low-signal articles are skipped.
- Topic embedding is optional and only produced when longer text is available.

### `embedArticles`

Backfill/batch orchestrator:
- Scans a user's articles in ID-order batches.
- Calls `embedArticle` per row.
- Returns counters: scanned/reused/embedded/skipped.

---

## 5) Event assignment and event evolution

### `assignArticleToEvent`

This module performs event matching with multiple signals:

- **Semantic similarity** (`cosine(articleVector, eventVector)`) is dominant.
- **Headline token overlap** (Jaccard-like similarity).
- **Temporal proximity** (`published` vs `event.lastSeen`) capped by max gap.
- **Named entity overlap** heuristic from title/description capitalization patterns.
- **Recency decay** multiplier that downweights stale events.

It builds a composite match score, evaluates candidate events (bounded by `MAX_CANDIDATES`), and decides between:

1. update existing event (`assignArticleToExistingEvent`), or
2. create a new event from candidate articles (`createAndAssignEvent`), or
3. leave event assignment unresolved when conditions are insufficient.

It also normalizes/synchronizes topic assignments between event-level membership and each article in the event (`event_topics` -> `article_topics`).

### `createAndAssignEvent`

When a new event is needed:
- Computes centroid vector from candidate articles.
- Derives `firstSeen`, `lastSeen`, source diversity, representative article, event name.
- Creates `events` row with initial status + baseline strength.
- Bulk-updates involved articles to new `eventId`.
- Optionally runs topic assignment for the event and sets primary `topicId`.

### `assignArticleToExistingEvent`

For existing events:
- Blends event vector with `EVENT_VECTOR_ALPHA`.
- Increments `articleCount`, updates `lastSeen`, recomputes lifecycle status.
- Recomputes source diversity.
- Optionally reassigns topic memberships for the evolved event.

### Lifecycle model

Event status transitions depend on age and article count:
- recent + small -> `emerging`
- recent + larger -> `active`
- older than freshness window -> `cooling`
- older than cooling threshold -> `archived`

---

## 6) Topic assignment model

### `assignSemanticUnitToTopic` / `assignEventToTopic`

The topic layer supports **ranked multi-membership**:

- Scan user topics (cached or DB) and score cosine similarity.
- Keep candidates above `secondaryThreshold`.
- Mark one primary candidate if above `primaryThreshold`.
- Return up to `MAX_TOPICS_PER_ARTICLE` assignments with rank + confidence.

If no candidates qualify:

1. If best match crosses `TOPIC_IDENTITY_THRESHOLD`, reuse/update that topic (identity memory path).
2. Else use deterministic `topicKey` lookup for semantic replay stability.
3. Else attempt **new topic creation** (`createTopic`) with evidence gating.

Replay context uses hysteresis (slightly stricter thresholds) to avoid noisy reassignment during backfills.

### `updateTopic.js`

Matched topics get activity touch (`lastActivityAt`).
Primary topic vector may drift, but drift is guarded by:
- feature flag (`TOPIC_VECTOR_DRIFT_ENABLED`),
- assignment context (disabled in replay),
- max similarity condition.

### `createTopics.js`

Topic creation is gated by minimum evidence from nearby unassigned events:
- minimum seed event count OR minimum total seed article count.

New topic vector is averaged from seed event vectors (or falls back to incoming vector), with generated name and stable key.

### `topicHelpers.js`

Provides:
- cosine + vector blending utilities,
- deterministic topic key hash,
- seed collection from event candidates,
- debug logging hooks,
- cache upsert helper.

---

## 7) Reclustering workflow (`reclusterForUser`)

`reclusterForUser` is the batch reconciliation path:

- Uses `RECENCY_WINDOW_DAYS` scope for incremental replay.
- Ensures vectors exist (embedding missing articles where possible).
- Reassigns articles to events using current thresholds/logic.
- Recomputes per-event vectors/status/strength.
- Reassigns event-to-topic memberships.
- Recomputes topic aggregate counters (`articleCount`, `eventCount`, `lastActivityAt`).
- Logs distribution metrics (reuse ratio, event size profile, assignment coverage).

This is effectively the system's "semantic compaction / consistency repair" run.

---

## 8) Interest islands and score propagation

### `buildInterestIslands`

This module turns topic interactions into user preference clusters:

- Builds topic-level signals from article engagement (stars, clicks, deep reads, opens, negatives).
- Applies weighting, recency decay, and confidence shaping.
- Produces weighted vector profiles per community/island.
- Matches to existing islands or creates/evolves new ones.
- Maintains `island_topics` memberships with blend+decay behavior.
- Archives stale/weak islands by thresholds.
- Optionally labels islands via taxonomy-vector nearest match.
- Writes population audits for explainability/traceability.

### `buildArticleInterestScoresForUser`

Score propagation SQL pass:
- Resets all `articles.interestScore` for user to zero.
- Recomputes each article score from associated topic memberships and active islands.
- Uses strongest signed island weight per article (by absolute magnitude rule).

Net effect: semantic topic membership + behavioral islands become a single per-article ranking signal.

---

## 9) Design characteristics in current implementation

1. **Hierarchical semantics**: Article -> Event -> Topic -> Island.
2. **Hybrid matching**: semantic vectors are primary, lexical/time/entity features are corroborative.
3. **Stateful memory**:
   - identity threshold + deterministic topic keys reduce churn,
   - replay hysteresis prevents unstable remapping.
4. **Controlled drift**:
   - topics drift slowly and conditionally,
   - events adapt faster to new evidence.
5. **Lifecycle-aware clustering**:
   - events age out; islands can archive when stale.
6. **Many-to-many topic memberships with ranking**:
   - supports nuanced cross-topic semantics while preserving a primary topic.
7. **Behavioral personalization is downstream**:
   - semantic clustering is upstream; user preferences shape the final article scoring via islands.

---

## 10) Operational notes

- Most tunables are environment-driven; production behavior can vary significantly by env values.
- If embeddings are unavailable, event/topic assignment can be partially skipped, reducing clustering quality.
- Multi-source and evidence gates protect against over-fragmented/low-confidence events/topics.
- The architecture is incremental-first but includes replay/recluster paths to recover consistency.
