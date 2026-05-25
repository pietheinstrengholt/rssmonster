# RSSMonster Semantic Pipeline Architecture Review (Interest Island Stack)

## Scope Reviewed

Reviewed implementation across event/topic/island assignment and data models, with focus on long-term semantic stability, probabilistic behavior, and scaling:

- `server/services/articles/assignArticleToEvent.js`
- `server/services/events/createEvents.js`
- `server/services/events/updateEvents.js`
- `server/services/topics/assignEventToTopic.js`
- `server/services/topics/createTopics.js`
- `server/services/islands/buildInterestIslands.js`
- `server/services/config/semanticConfig.js`
- Semantic graph models (`Article`, `Event`, `Topic`, `Island`, plus join tables)

---

## Executive Assessment

The overall layering (Article → Event → Topic → Island → Taxonomy) is directionally strong, especially the explicit optionality and threshold-gated probabilistic links. The major risk is **semantic identity instability under incremental greedy assignment**, causing long-term fragmentation and hidden drift. At scale, bottlenecks will surface first in candidate retrieval/scoring fan-out, full-table/vector-in-JSON scans, and expensive bulk synchronization paths.

If only a few redesigns can happen now, prioritize:

1. Persistent identity & reconciliation loops (no disposable clustering semantics)
2. Candidate lifecycle state machines (seed → corroborated → confirmed)
3. ANN-backed vector retrieval and graph-indexed candidate pruning
4. Observability for drift, fragmentation, and compression-ratio health

---

## 1) Strongest Architectural Decisions

1. **Semantic layer separation is correct and future-proof**: events for concrete stories, topics for recurring semantic domains, islands for long-lived affinity memory. This is explicit in service boundaries and models.  
2. **Optional links are the right probabilistic posture** (`article.eventId`, `event.topicId`, `article.topicId` nullable), preventing forced misclassification.  
3. **Threshold hierarchy is mostly sensible**: stricter event similarity vs looser topic similarity, with identity/primary/secondary topic thresholds (`TOPIC_IDENTITY_THRESHOLD`, `PRIMARY_TOPIC_THRESHOLD`, `SECONDARY_TOPIC_THRESHOLD`).  
4. **Recency decay and lifecycle states exist** for events and islands (`emerging/active/cooling/archived`, decay factors and stale archive logic).  
5. **Multi-signal event matching** combines semantic similarity, headline overlap, temporal proximity, entity overlap and recency decay.  
6. **Topic multi-membership support** (ranked + confidence + primary flag) is a strong recommender-style design primitive.

---

## 2) Biggest Hidden Risks

1. **Greedy order sensitivity causes path dependence** (article/event/topic assignment depends on processing order and current cache state). Over long horizons this creates irreversible topology artifacts.
2. **Vector state mutation without periodic global reconciliation** (EMA-style blending on events/topics/islands) accumulates drift and can “walk” clusters away from original identity.
3. **Topic key strategy appears brittle** (`topicKey` hash + fallback checks) and not globally unique per user-semantic identity; collisions/instability can silently merge or fork semantics.
4. **Label instability** from top-topic-name composition and nearest-taxonomy display fallback can flip labels without identity change, reducing explainability.
5. **Heuristic NER/token overlap is English/title-biased**, likely weak in multilingual/noisy headlines and source heterogeneity.
6. **Denormalized topic links can diverge** (`article.topicId` consistency with event/topic joins requires strict repair discipline).
7. **Silent confidence inflation/deflation loops** via repeated blending/decay in `IslandTopic` without calibrated uncertainty models.
8. **No robust uncertainty propagation**: confidences are treated as scalar scores, not posterior probabilities with calibration/error bounds.

---

## 3) Where Fragmentation Will Likely Emerge

1. **Event fragmentation**: high `EVENT_SIM_THRESHOLD` + short temporal half-life + hard max gap means same story reopens as multiple events after pauses.
2. **Topic fragmentation**: strict secondary threshold and limited candidate window (`MAX_CANDIDATES`) can fail to find latent matches, creating new topics unnecessarily.
3. **Island fragmentation**: behavioral-affinity greedy community assignment with fixed threshold and capped communities per topic can split semantically coherent domains.
4. **Cross-language fragmentation**: no explicit language-normalized matching strategy at event/topic layers besides embeddings.
5. **Source-style fragmentation**: publication tone differences can deflate headline/entity overlap while vectors still close, fragmenting corroboration detection.

---

## 4) First Scaling Problems to Appear

1. **Candidate retrieval throughput**: scanning/sorting up to `MAX_CANDIDATES` per assignment from relational tables with JSON vectors.
2. **Vector math in app tier**: cosine over large candidate sets in Node process becomes CPU-bound and latency sensitive.
3. **Join-table churn**: repeated delete/reinsert sync for article/event topic mappings and island memberships increases write amplification.
4. **Full rebuild style operations** in island building and audit paths will become expensive with millions of articles.
5. **Hot partitions per active user**: user-centric queries and updates cause lock/contention and IO hotspots.
6. **Lack of ANN/vector index** means recall vs latency tradeoff worsens rapidly with corpus size.

---

## 5) What to Redesign Before Continuing

1. **Event creation lifecycle**: replace immediate event materialization with candidate seeds and corroboration thresholds (source diversity + temporal + semantic consensus).
2. **Identity reconciliation service**: periodic merge/split proposals for events/topics/islands using batched global optimization, not only incremental local decisions.
3. **Stable naming architecture**: separate immutable identity key from mutable display labels; taxonomy mapping should influence naming but not identity.
4. **Confidence model**: introduce calibrated confidence + uncertainty intervals; treat scores as probabilistic evidence, not raw heuristics.
5. **Data access for vectors**: plan migration to vector-capable retrieval layer (MySQL vector support or external ANN store) with hybrid filters.

---

## 6) Metrics to Monitor Continuously

### Topology & Compression
- article→event attachment rate
- event→topic attachment rate
- topic→island attachment rate
- compression ratios: articles/event, events/topic, topics/island
- orphan rates at each layer

### Stability
- reattachment/churn rate (objects changing parent layer)
- identity half-life per topic/island
- label churn rate vs identity churn rate
- merge/split frequency

### Quality
- corroboration precision proxy (multi-source agreement)
- event coherence (intra-cluster vector variance)
- topic coherence and separation
- island cohesion and drift velocity (centroid delta over time)

### Recommender Outcomes
- engagement lift by island/topic assignment bucket
- calibration curves: predicted confidence vs realized engagement
- novelty/redundancy balance metrics

### System Health
- per-stage queue lag, throughput, p95/p99 latency
- candidate set size distributions
- DB query cost + lock wait + write amplification

---

## 7) Missing Lifecycle States

### Event
- `candidate_seed`
- `candidate_corroborating`
- `confirmed`
- `contested` (evidence conflict)
- `merged`
- `superseded`

### Topic
- `candidate`
- `established`
- `drifting`
- `dormant`
- `retired`
- `merged`

### Island
- `emerging_affinity`
- `stable`
- `stale`
- `archived`
- `reactivated`

Also missing: **explicit transition reasons** and provenance logs for explainability.

---

## 8) What Should Be Asynchronous/Background

1. Event/topic/island reconciliation passes
2. Merge/split candidate generation + human-review hooks
3. Drift detection + alerting
4. Taxonomy remapping and label stabilization
5. Confidence recalibration jobs
6. Graph integrity repair (denormalized topic/event consistency)
7. Compression health audits and anomaly detection
8. Backfill/replay processing with deterministic snapshots

Online path should stay minimal: ingest, embed, candidate retrieval, provisional assignment.

---

## 9) Long-term Reconciliation Design

Adopt dual-loop architecture:

- **Fast loop (online)**: provisional assignment with conservative thresholds and hysteresis.
- **Slow loop (offline)**: global reconciliation over rolling windows (e.g., 7/30/90 days) using graph + embedding evidence.

Reconciliation should produce deterministic actions:
- keep
- reattach
- split
- merge
- demote to candidate
- archive

All actions require provenance (`why`, `scores`, `inputs`, `versioned policy`).

---

## 10) Semantic Memory Over Months/Years

1. Use **versioned centroids** (time-sliced vectors) rather than single mutable vector.
2. Keep **identity anchors** (taxonomy IDs, canonical descriptors, stable hash signatures).
3. Track **drift trajectories** and detect semantic bifurcation.
4. Apply **memory consolidation**: promote stable regions, decay noise, preserve long-term prototypes.
5. Maintain **cold storage snapshots** for replay/regression.

---

## 11) Applicable Recommendation-System Patterns

1. **Two-tower retrieval mindset** for candidate generation (user/island embedding × content embedding).
2. **Candidate generation + reranking** split (ANN recall then multi-signal scoring).
3. **Temporal dynamics modeling** (short-term vs long-term interest decomposition).
4. **Bandit-style exploration controls** for uncertain assignments.
5. **Calibration and counterfactual evaluation** for confidence-driven decisions.
6. **Diversity/novelty regularization** to prevent over-concentration in dominant islands.

---

## 12) What Mature Production Systems Do Differently

1. Explicit **state machines** with audit trails for each entity lifecycle.
2. Dedicated **feature store / vector index** for low-latency nearest-neighbor retrieval.
3. **Policy versioning** for thresholds and scoring weights.
4. **A/B and shadow pipelines** before threshold changes.
5. **Automated drift and fragmentation alarms** with rollback playbooks.
6. **Human-in-the-loop tooling** for high-impact merge/split corrections.
7. Strict **offline evaluation harness** with gold sets and replay datasets.

---

## 13) Missing Semantic Graph Structures

1. Weighted edges with evidence provenance (`semantic`, `temporal`, `source-diversity`, `entity`).
2. Negative/repulsive edges (e.g., contradictory semantics).
3. Explicit `MERGED_INTO` / `SPLIT_FROM` lineage edges.
4. Temporal edges (`PRECEDES`, `EVOLVES_FROM`) for story evolution.
5. Taxonomy confidence edges with version history.
6. Community overlap graph between islands (not just hard membership).

---

## 14) Database/Indexing Optimizations Needed Eventually

1. Composite indexes aligned to retrieval predicates (`userId`, `updatedAt`, lifecycle status, published windows).
2. Partitioning strategy (time and/or user hash) for article/event heavy tables.
3. Covering indexes for hot joins (`article_topics`, `event_topics`, `island_topics`).
4. Materialized aggregates for counts/diversity/cohesion metrics.
5. Vector-capable index layer (native or external ANN) for scalable cosine search.
6. Write-optimized batch upserts with idempotency keys to reduce churn.

---

## 15) What to Simplify

1. Reduce overlapping heuristics in online event matching; keep a small, interpretable core.
2. Collapse duplicate cosine implementations into shared utility with tests.
3. Standardize similarity/confidence naming and ranges.
4. Minimize synchronous fan-out updates in hot path.
5. Simplify label generation: stable canonical + optional user-friendly alias.

---

## 16) What to Redesign Completely

1. **From greedy clustering to reconciliation-driven graph evolution**.
2. **From immediate event creation to candidate corroboration lifecycle**.
3. **From mutable singleton centroids to temporal memory representations**.
4. **From threshold constants to policy-managed, calibrated decisioning**.
5. **From opaque scores to explainable evidence bundles per edge/assignment**.

---

## Concrete 90-Day Roadmap (Opinionated)

### Phase 1 (Weeks 1-3): Instrumentation + Safety
- Add lifecycle states and transition logs.
- Introduce key metrics dashboards (compression, fragmentation, churn, drift).
- Freeze aggressive threshold tuning until baseline is visible.

### Phase 2 (Weeks 4-7): Candidate Lifecycle
- Implement event candidate seeds and corroboration checks.
- Gate confirmation on multi-source + semantic consensus.
- Add contested/superseded handling.

### Phase 3 (Weeks 8-10): Reconciliation Engine
- Nightly reconciliation for merge/split/reattach proposals.
- Add deterministic policy versioning and replay tests.

### Phase 4 (Weeks 11-13): Scale Foundation
- Introduce ANN-backed candidate retrieval.
- Move heavy sync jobs fully async.
- Add drift alarms and rollback controls.

---

## Final Architectural Verdict

You have a strong conceptual hierarchy and a solid probabilistic intent. The immediate danger is not model quality in isolation—it is **identity instability over time** due to greedy online assignment and insufficient reconciliation. If you fix lifecycle rigor, reconciliation, and observability now, the architecture can mature into a production-grade semantic memory system. If not, fragmentation and drift will compound faster than any threshold tuning can compensate.
