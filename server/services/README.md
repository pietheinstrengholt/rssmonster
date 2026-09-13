# README.md

# RSSMonster Semantic Architecture

This document defines the semantic architecture of RSSMonster.

The semantic system transforms raw RSS articles into increasingly stable and meaningful representations.

```
Article embedding
  ├─→ Event → Topic relationships → Island
  ├─→ direct Article/Island similarity
  └─→ explicit behavioral fallback
                    ↓
         confidence-aware interestScore
                    ↓
Recommended ← freshness, Quality, Event corroboration, rule boost
```

Each layer has a single responsibility. The graph shows scoring relationships,
not Island creation from arbitrary news. Islands form from behavior; Topics
enrich them. A Topic or Island match is optional for Recommended ranking.

Authoritative details: [Events](events/README.md), [Topics](topics/README.md),
[Islands and interest scoring](islands/README.md), [final ranking formula](../../docs/scoring.md),
and [semantic regression testing](../tests/semantic/README.md).

Lower layers represent individual observations.

Higher layers summarize and compress information into increasingly durable semantic knowledge.

---

# Mental Model

RSSMonster continuously answers four increasingly abstract questions.

## Articles

> What was published?

Articles are individual feed items.

They represent raw observations.

Articles are the most numerous and most volatile layer.

---

## Events

> What happened?

Events group multiple Articles describing the same occurrence. Embeddings retrieve
candidates; shared occurrence decisions also check lexical/entity evidence, time,
whole-Event span, and version/location/action/object-state compatibility.

Events are:

- time-aware
- short-lived
- evidence-based
- tested for stable incremental membership, without claiming perfect order independence

Not every Article belongs to an Event.

Standalone articles remain eventless.

---

## Topics

> What recurring subject does this belong to?

Topics represent recurring semantic subjects that span multiple Events or repeated user behavior.

Topics evolve slowly.

They intentionally survive beyond individual news stories.

RSSMonster supports three Topic types:

### Event Topics

Created automatically from recurring Events.

Purpose:

- connect related Events
- improve discovery
- reduce fragmentation

---

### Behavioral Topics

Created from repeated positive user engagement.

Behavioral Topics are durable Topic records.

They are built from semantically similar engaged Articles.

Behavioral Topics represent long-term user interests.

Behavioral Topics never own Events.

---

### Hybrid Topics

Hybrid Topics contain both Event evidence and Behavioral evidence.

They bridge recurring news with long-term interests.

Hybrid Topics may own Events.

---

## Interest Islands

> What does this user consistently care about?

Interest Islands are the highest semantic layer.

They represent durable user interests.

All layers are user-scoped. Islands specifically encode signed behavioral
preference. Their confidence depends on observed support and cohesion; a singleton
can be useful without having the authority of a repeatedly supported interest.

Interest Islands consume:

- behavioral article evidence
- persisted Topics
- historical user behavior

---

# Semantic Compression

The hierarchy summarizes semantic evidence; it is not a mandatory path for every
Article or a guarantee that each layer contains fewer records.

```
Many Articles
        ↓
Fewer Events
        ↓
Fewer Topics
        ↓
Few Interest Islands
```

As information moves upward it becomes:

- less volatile
- more stable
- more personalized
- slower to change

Lower layers describe what happened.

Upper layers describe what consistently matters.

---

# Processing Pipeline

Production separates the critical semantic path from durable optional enrichment.

```
rssmonster-worker
 └─ crawl scheduler loop
      └─ crawl → embedding → events → topics → island scoring

rssmonster-ai-worker
 └─ claim processing_jobs
      ├─ summaries
      ├─ quality scoring
      ├─ inferred tags
      └─ semantic labels
```

The semantic pipeline always flows in one direction.

```
Normal crawl: new Articles → Events → Topics → interest scoring
Calibration: behavioral Articles → Island profiles → persistence → Topic enrichment → interest scoring
Separate service: engaged Articles → behavioral Topics
```

Normal crawling scores against existing Islands; it does not recalibrate them.
Behavioral Topic calibration is a separate service, not a normal crawl or
historical semantic pipeline stage. Downstream systems consume upstream results.

Higher layers must never redefine lower layers.

Embeddings, deterministic duplicate detection, Event creation, Topic assignment,
and Island scoring stay ordered in the crawl loop. Optional job claiming pauses
while this critical path is active. The crawl loop never waits for optional jobs
to drain, and optional inference or labeling failures must not fail it.

Article enrichment jobs are committed atomically with new or revised article
rows. Their payloads contain owned identifiers, content/version guards, contract
versions, and resolved action-owned score overrides, never article content.
Handlers reload and lock the current target before writing, preserve every
non-inferred tag provenance, and treat deleted, disabled, filtered, or stale
targets as successfully obsolete.

Event, Topic, and Island label jobs are enqueued only after the owned semantic
target exists. Their handlers reload current bounded title context and update
only the generated presentation field. Deterministic fallback labels remain the
source of usable presentation while optional labels are absent.

The database queue owns bounded claims, renewable leases, exponential retry
backoff, terminal dead-lettering, and expired-lease recovery. SQLite processing
concurrency is one; MySQL workers use locked, skip-locked claims. Operational
snapshots and lifecycle logs must expose safe identifiers and counts without
article content or inference prompts.

---

# Layer Relationships

## Articles → Events

Events summarize Articles.

Articles never decide Event membership by themselves.

Multiple corroborating Articles are required before creating an Event.

---

## Events → Topics

Events may be assigned to one or more Event or Hybrid Topics.

Pure Behavioral Topics are never candidates for Event assignment.

Topic creation is intentionally conservative.

Not every Event becomes a Topic.

---

## Behavioral Articles → Behavioral Topics

Positive user engagement creates Behavioral Topics.

Signals include:

- starring
- clicking
- deep reading

Behavioral Topics are persisted in the Topic table.

ArticleTopic stores the durable evidence linking Articles to Behavioral Topics.

---

## Topics → Interest Islands

Interest Islands consume Topics.

Topics help describe recurring semantic interests.

Interest Islands are responsible for personalization, not semantic grouping.

---

# Source of Truth

The semantic model intentionally separates relationship tables from denormalized convenience fields.

## Articles

Primary relationships:

- ArticleTopic

Convenience field:

- Article.topicId

---

## Events

Primary relationships:

- EventTopic

Convenience field:

- Event.topicId

---

## Interest Islands

Primary relationships:

- IslandTopic

---

Join tables are always the source of truth.

Denormalized fields exist only for efficient querying.

Never update denormalized fields without updating their corresponding relationship tables.

---

# Architectural Principles

## Conservative Creation

Do not create semantic objects without sufficient evidence.

Events require corroborating Articles.

Topics require recurring semantic evidence.

Interest Islands require qualifying behavioral evidence. Singletons are allowed
with reduced confidence. Capacity never authorizes below-threshold assignment;
unmatched profiles may remain unassigned.

---

## Stable Evolution

Higher semantic layers evolve gradually.

Avoid replacing vectors or memberships outright.

Prefer:

- blending
- decay
- confidence updates

over destructive replacement.

---

## Explainability

Every semantic decision should be explainable.

The system should be able to answer questions such as:

- Why was this Article assigned to this Event?
- Why was this Event assigned to this Topic?
- Why does this Topic belong to this Interest Island?

Explainability is a first-class design goal.

---

## User Isolation

All semantic processing is scoped by user.

Never mix Articles, Events, Topics or Interest Islands across users.

Every query touching user-owned semantic data must filter by `userId`.

---

## Deterministic Processing

Use stable tie-breaking and shared decision policies across scopes. Convergence
is a goal tested with fixtures, not a guarantee under every processing order:
bounded retrieval, available evidence and embeddings can change candidate sets.

---

# Persistence Principles

Semantic objects should not be recreated unnecessarily.

Prefer updating existing semantic objects over creating new ones.

Preserve:

- identifiers
- relationships
- confidence
- historical context

whenever possible.

---

# Coding Principles

- Keep semantic logic inside services.
- Controllers should not contain semantic algorithms.
- Import Sequelize models only through `models/index.js`.
- Keep vector operations centralized.
- Avoid duplicate implementations of similarity or blending logic.
- Keep thresholds configurable through `semanticConfig.js` or environment variables.
- Preserve existing debug logging.
- Keep semantic processing deterministic and testable.

---

# Common Regression Traps

Avoid introducing changes that:

- create one-article Events
- create Topics for every Event
- allow Behavioral Topics to own Events
- bypass join tables
- recreate semantic objects unnecessarily
- mix data between users
- replace vector blending with full overwrites
- remove explainability
- make incremental processing behave differently from rebuilds

---

# Definition of Done

A semantic change is complete when:

1. Every layer preserves its own responsibility.
2. Lower layers remain independent of higher layers.
3. User isolation is preserved.
4. Relationship tables remain the source of truth.
5. Semantic decisions remain explainable.
6. Incremental processing and rebuilds converge toward the same result.
7. Existing tests continue to pass or are updated accordingly.


# AI Capability Boundary

Application and domain services use `ai/capabilities/` through their existing
embedding, enrichment, labeling, feed, Smart Folder, and agent entry points.
Only `ai/providers/inference.js` maps these operations to inference HTTP routes;
`inference/inferenceClient.js` owns transport resilience, including streamed
assistant requests. The server has no model-provider configuration.

See [AI capabilities](ai/README.md) for contracts, dependency injection,
configuration versus readiness, and the migration map.

# Recommendation coverage and evidence quality

Every eligible Article receives a finite runtime Recommended score. Eligibility
still belongs to the caller's ownership, visibility and explicit filters. No
trustworthy interest path means `interestScore = 0`, not a missing Recommended
score. Personalization coverage may therefore be sparse while Recommended coverage
is 100%. Missing Event evidence contributes zero corroboration; quality/freshness
retain their existing defaults. Final ranking weights were not retuned in Phases
A–C; the [scoring guide](../../docs/scoring.md) owns the exact formula.

Preference strength, Island confidence and relationship confidence are separate.
Topic and direct paths compete per Island; the strongest positive and strongest
negative contributions are combined with bounds. Explicit likes/favorites/dislikes
without a same-sign Island can transfer through a bounded, recent, intent-aware
behavioral path. Passive non-engagement is not negative evidence. See the
[Island README](islands/README.md#confidence-aware-interest) for formulas and limits.

Topic identity concerns durable subjects, not occurrences. Relationship confidence
must survive downstream; weak fallback is secondary and attenuated. Generated
labels are presentation metadata, not independent matching or ranking evidence.
Calibration replaces unchanged behavioral signal snapshots rather than accumulating
replayed counters. Diagnostics distinguish seed/self evidence from held-out matches;
passing semantic fixtures does not establish recommendation ranking quality.
