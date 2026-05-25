# Semantic Pipeline Validation (2026-05-25)

This review validates the current implementation against the intended semantic architecture.

## Executive Verdict

**Overall assessment: Partially aligned, with two critical architectural deviations.**

- **Strong**: incremental-first execution path, conservative matching thresholds, topic identity reuse, and island continuity mechanisms.
- **Weak**: no explicit event *candidate seed lifecycle* persisted as a first-class state, and full rebuild mode does not preserve topic/island identity strongly enough.

---

## 1) Identity persistence

### Events
- Incremental event identity persistence is strong: new articles try to attach to existing events using semantic + auxiliary gates and only then create a new event. (`assignArticleToEvent`).
- Event vectors are blended incrementally (`EVENT_VECTOR_ALPHA`) rather than replaced, preserving continuity.

**Assessment**: **Good** for incremental mode.

### Topics
- Topic identity is explicitly handled with `TOPIC_IDENTITY_THRESHOLD` fallback and `topicKey` matching before creating new topics.

**Assessment**: **Good**.

### Islands
- Islands preserve identity via profile matching threshold + vector blending + decayed membership carry-forward.

**Assessment**: **Good**.

---

## 2) Incremental reconciliation quality

- Pipeline default path runs `buildEvents({ mode: 'incremental' })`, then topic build in `incremental` context, then island build.
- Incremental event matching is multi-signal: semantic similarity, headline similarity, temporal proximity, entity overlap, plus recency decay.

**Assessment**: **Strong** incremental behavior.

---

## 3) Fragmentation risks

Positive controls:
- Strict event threshold (`0.84` default) + auxiliary requirement reduces false-positive merges.
- Topic identity threshold + key reuse reduces topic proliferation.

Risk factors:
- Event cache and candidate scans are limited (`MAX_CANDIDATES=300`), which can fragment during high-volume spikes by missing older/long-tail candidates.
- Strong recency decay may over-penalize valid slower stories.

**Assessment**: **Moderate risk** (acceptable but tunable).

---

## 4) Event candidate lifecycle handling

Intended architecture calls for explicit candidate seeds promoted after corroboration.

Current behavior:
- The code enforces corroboration (`MIN_EVENT_ARTICLES`, `MIN_EVENT_SOURCES`, optional multi-source requirement).
- But unmatched items remain orphan/topic-only; there is no persisted `candidate_event` entity/state in the DB model.
- Event states are `emerging/active/cooling/archived`, where `emerging` means a real event with low count, not a pre-confirmation seed.

**Assessment**: **Major gap** versus intended architecture.

---

## 5) Corroboration logic quality

- Corroboration combines semantic + temporal + narrative signals and source diversity gates.
- Multi-source can be made mandatory via env (`REQUIRE_MULTI_SOURCE_FOR_EVENT`).

Limitations:
- Entity overlap uses simple capitalization heuristic from title/description, which is brittle for lowercase brands and multilingual text.

**Assessment**: **Good design, medium-quality NER proxy**.

---

## 6) Threshold quality

- Event threshold and topic thresholds are directionally consistent with “prefer false negatives”.
- Replay context raises topic thresholds slightly (hysteresis), helpful for identity stability.

Concern:
- Defaults are hard-coded heuristics; there is no automatic calibration loop from graph-health metrics.

**Assessment**: **Reasonable static thresholds; weak adaptive tuning**.

---

## 7) Drift prevention

- Event/topic/island vectors all use blend-based updates rather than full replacement.
- Time windows and recency weighting reduce stale anchoring.

Concern:
- Event blend alpha (`0.45`) is relatively high and may allow event meaning drift in long-running stories.

**Assessment**: **Good controls with event-level drift sensitivity risk**.

---

## 8) Topic/island stability

- Topic identity fallback + key reuse and island membership decay/blend are aligned with continuity goals.
- Archive mechanics exist for stale islands.

**Assessment**: **Strong**.

---

## 9) Semantic compression quality

Expected healthy 10,000 article ranges were provided; current implementation has observability for event size distributions but no explicit target guardrails/alerts.

**Assessment**: **Unverified by policy** (instrumentation insufficient to enforce target bands).

---

## 10) Optional hierarchy handling

- Architecture requires optionality Article→Event→Topic→Island.
- Implementation allows topic-only assignment when event confidence/corroboration is insufficient.

**Assessment**: **Aligned**.

---

## 11) Orphan handling

- Orphans are intentionally retained as unassigned/topic-only when corroboration is insufficient.

**Assessment**: **Aligned and conservative**.

---

## 12) Merge/split behavior

- Full rebuild (`replay`) clears and recomputes event/topic assignments globally.
- This enables global merge/split correction.

Concern:
- Full rebuild currently does not strongly preserve topic/island IDs beyond similarity/key heuristics.

**Assessment**: **Functional but identity-preservation incomplete**.

---

## 13) Lifecycle states

- Events have explicit lifecycle states and age/article-count transition logic.
- Topics/islands have activity and archive-like mechanics.

Gap:
- Missing explicit *candidate event* lifecycle state machine.

**Assessment**: **Mostly good with a key missing state tier**.

---

## 14) Observability/debugging quality

- Event and island debug logs exist and include top-match diagnostics.
- Event summary reports assignment ratios and event size histogram buckets.

Gaps:
- No persistent semantic health dashboard tables/alerts for compression, fragmentation, drift deltas, or ID churn.

**Assessment**: **Good runtime logging, weak longitudinal observability**.

---

## 15) Long-term scalability

- Candidate scanning and in-memory caches are bounded.
- Incremental mode is operational default.

Risk:
- Bounded candidate window may reduce recall as corpus scale and story latency increase.

**Assessment**: **Operationally scalable, quality may degrade at scale without adaptive retrieval/indexing**.

---

## 16) Semantic graph health

- Health signals are partially present (reuse ratio, new event ratio, event size buckets).
- Missing explicit graph-health SLOs and enforcement.

**Assessment**: **Needs formal health policy layer**.

---

## 17) Failure modes

Likely failure modes:
1. **Candidate blind spot** from limited candidate pool and strict recency windows.
2. **Event drift** in prolonged stories due to high event alpha.
3. **Identity churn** in replay mode for topics/islands after threshold/model changes.
4. **NER heuristic miss** causing under-corroboration for semantically aligned articles.

---

## 18) Stability under continuous incremental updates

- Design is mostly stability-oriented: strict attachment, blending, identity thresholds, decay-based continuity.
- Absence of persisted candidate layer means the system relies on transient article pools rather than durable pre-event memory.

**Assessment**: **Stable but architecturally incomplete for the intended candidate-seed model**.

---

## Critical Recommendations (Opinionated)

1. **Add a first-class CandidateEvent table/state** with:
   - seed vector,
   - corroboration counters (articles/sources/time span),
   - promotion/expiry transitions,
   - optional link to promoted Event ID.

2. **Strengthen full-rebuild identity preservation** for topics/islands:
   - explicit old→new ID reconciliation pass,
   - stable fingerprints,
   - churn caps and ID continuity scoring.

3. **Add graph-health governance**:
   - target compression bands,
   - alerting for fragmentation and ID churn,
   - drift-change metrics across runs.

4. **Upgrade corroboration entity extraction** from capitalization heuristic to robust NER/entity linker.

5. **Tune event drift controls**:
   - lower `EVENT_VECTOR_ALPHA` or make alpha adaptive based on event age/cohesion.

## Final Grade

- **Incremental architecture**: **B+**
- **Full rebuild architecture**: **C**
- **Candidate-event philosophy compliance**: **D**
- **Overall alignment to intended design**: **B-**
