# Agents.md — Server Services

This file is the local operator guide for `server/services/`.
It narrows the repo-wide guidance to the semantic clustering architecture:
articles become **events**, events and engaged articles shape **topics**, and topics/articles feed durable **interest islands**.

---

## 1) Mental Model

Treat this area as a layered pipeline, not as isolated helper files.

1. **Articles**
   - Raw feed items with embeddings and engagement signals.
   - `Article.eventId` and `Article.topicId` are read-side denormalizations.
   - `ArticleTopic` is the durable source for article-topic evidence, especially behavioral evidence.
2. **Events**
   - Short-lived, time-aware clusters of related articles.
   - `Event.eventVector`, window fields, counts, status, and representative article summarize the cluster.
   - Event lifecycle and assignment thresholds belong in `services/config/semanticConfig.js`.
3. **Topics**
   - Longer-lived semantic memory.
   - `event` topics come from event clusters.
   - `behavioral` topics come from explicit user engagement.
   - `hybrid` topics can bridge both, but pure behavioral topics must not steal event ownership.
   - `EventTopic` and `ArticleTopic` are the ranked, confidence-scored sources of truth.
4. **Interest Islands**
   - Durable preference areas derived from user behavior and topic history.
   - Islands should evolve slowly, keep auditability, and score articles through topic links before vector fallback.

---

## 2) Non-Negotiable Invariants

- Always scope service queries by `userId` when touching user-owned `Article`, `Event`, `Topic`, or `Island` data.
- Import Sequelize models only through `../../models/index.js` or the correct relative path to `models/index.js`.
- Preserve `.js` extensions in local imports.
- Keep service modules framework-agnostic; controllers own request/response concerns.
- Do not directly import model definition files.
- Do not mutate old migrations to support service behavior; add a new migration when schema changes are required.
- Preserve join-table truth:
  - `ArticleTopic` owns article-topic evidence.
  - `EventTopic` owns event-topic evidence.
  - `IslandTopic` owns island-topic evidence.
  - `Article.topicId` and `Event.topicId` are primary-topic denormalizations only.
- Keep vector math centralized in `services/vectors/` or existing island/topic helpers. Avoid one-off cosine, normalize, or blend implementations unless a nearby local helper already exists and the scope is intentionally narrow.

---

## 3) Pipeline Boundaries

### Articles to Events

- Reuse stored article vectors when present.
- Match events with semantic, headline, temporal, and entity corroboration.
- Let event creation/update services maintain event summary fields.
- Sync event-owned topic links back to articles only through the existing event-topic sync path.
- Do not treat event assignment as proof of long-term user interest.

### Events to Topics

- Event assignment should consider only `event` and `hybrid` topics.
- Do not match events into pure `behavioral` topics.
- Keep ranked multi-topic assignments normalized with `normalizeTopicAssignments`.
- Update `Event.topicId` from the primary `EventTopic` row.
- Recompute topic stats after event-topic changes when counts or activity timestamps may be stale.

### Behavioral Interests to Topics

- Behavioral topics should be built from positive signals such as stars, clicks, and deep reads.
- Preserve breadth checks so one accidental interaction does not become durable memory.
- Write behavioral article evidence to `ArticleTopic` with `primaryInd: false` unless the surrounding code clearly changes that contract.
- Existing `hybrid` topics may absorb behavioral evidence; pure event topics should not become behavioral without an intentional transition.

### Topics and Articles to Islands

- Build behavior-derived islands first, then enrich from topic profiles, then refresh article interest scores.
- Prefer topic-to-island scoring before article-vector fallback.
- Keep island updates gradual with existing blend/decay helpers.
- Maintain `populationAudit` when changing island membership or enrichment behavior.
- Archive stale or low-confidence islands through existing persistence rules rather than hard-deleting them.

---

## 4) Change Strategy for This Area

Before editing semantic services:

1. Identify which table is the source of truth.
2. Check whether the field being edited is derived and needs reconciliation.
3. Prefer threshold/config changes in `config/semanticConfig.js` or existing env-backed constants.
4. Add focused tests around user isolation, join-table rows, denormalized primary links, and score/count updates.

Keep diffs small. These services are sensitive to subtle scoring drift.

---

## 5) Service Coding Rules

- Use plain ESM named exports for reusable services; default exports are fine only where the file already uses that pattern.
- Keep functions cohesive and deterministic when possible.
- Pass `transaction` through all writes that are part of one logical rebuild or persistence step.
- Use `raw: true` only when model instance methods are not needed.
- Normalize numeric IDs with `Number(...)` before comparing IDs from models, raw rows, and request inputs.
- Clamp scores, confidence, weights, and similarities before persisting.
- Round persisted scores consistently with nearby code, usually `toFixed(4)` converted back to `Number`.
- Sort deterministic outputs by score first and stable IDs second.
- Preserve debug flags such as `EVENT_DEBUG`, `EVENT_RECLUSTER_DEBUG`, and `ISLAND_DEBUG`; keep logs compact and actionable.

---

## 6) Common Regression Traps

- Updating `Article.topicId` directly while forgetting `ArticleTopic`.
- Updating `Event.topicId` directly while forgetting `EventTopic`.
- Letting event assignment match pure behavioral topics.
- Treating old events from another user as candidates during replay or reconciliation.
- Rebuilding recent windows without cleaning stale event/topic links.
- Creating durable topics or islands from too little evidence.
- Blending vectors without normalization.
- Comparing vectors with different dimensions as if similarity were meaningful.
- Forgetting that event clusters are time-bounded while topics and islands are memory.
- Recomputing article interest scores before island-topic links are settled.

---

## 7) Testing Guidance

For service changes, prefer targeted Vitest tests under `server/tests/`.

Run the smallest relevant checks:

```bash
cd server
npm test -- <test-file-or-pattern>
npm run lint
```

Add or update tests when changing:

- user ownership or isolation behavior,
- event assignment thresholds or candidate filtering,
- event/topic join-table synchronization,
- behavioral topic creation or cleanup,
- island persistence, membership evolution, archival, audit, or article interest scoring.

Server tests use real database behavior. Avoid Sequelize model mocks for these service pipelines.

---

## 9) Definition of Done

A service change is done when:

1. The requested behavior works without breaking article -> event -> topic -> island invariants.
2. User-owned data remains scoped to the correct user.
3. Source-of-truth join rows and denormalized primary fields stay synchronized.
4. Scores, counts, vectors, and lifecycle state are reconciled where needed.
5. Targeted server tests and lint pass, or any limitation is explicitly documented.
