# README.md

# Topic System

This document defines how RSSMonster builds and maintains semantic Topics.

```
Article
    ↓
Event
    ↓
▶ Topic
    ↓
Interest Island
```

Topics are the semantic memory layer of RSSMonster.

They summarize recurring subjects that span multiple Events or repeated user behavior.

Unlike Events, Topics are intentionally stable and evolve gradually over time.

---

# Purpose

Topics answer a single question:

> **What recurring subject does this belong to?**

Examples:

```
Artificial Intelligence

Ukraine War

Electric Vehicles

OpenAI

Linux & Self-hosting
```

A Topic is **not**:

- a single news story
- a user interest
- a category
- a feed

Topics represent recurring semantic subjects.

---

# Design Principles

Topics are intentionally:

- long-lived
- stable
- conservative
- evidence-based
- slowly evolving

Topics should survive individual news stories.

Not every Event deserves its own Topic.

---

# Topic Types

RSSMonster supports three Topic types.

## Event Topics

Event Topics are created automatically from recurring Events.

Purpose:

- connect related Events
- reduce fragmentation
- improve discovery across multiple news stories

Event Topics represent recurring news.

They are created conservatively.

---

## Behavioral Topics

Behavioral Topics are created from repeated positive user engagement.

Signals include:

- starred articles
- clicked articles
- deeply read articles

Behavioral Topics are durable Topic records.

They are built from semantically similar engaged Articles.

Behavioral Topics represent long-term user interests.

Behavioral Topics never own Events.

---

## Hybrid Topics

Hybrid Topics contain both:

- Event evidence
- Behavioral evidence

Hybrid Topics bridge recurring news with long-term user interests.

Unlike pure Behavioral Topics, Hybrid Topics may own Events.

---

# Semantic Responsibilities

Topics summarize semantic information.

They do **not**:

- cluster Articles
- create Events
- personalize ranking
- model user preferences directly

Those responsibilities belong to other semantic layers.

---

# Event Topics

Event Topics are built from Event vectors.

```
Event
    ↓
Find matching Topic
    ↓
Update existing Topic
        OR
Create new Topic
```

Not every Event becomes a Topic.

Topic creation is intentionally conservative.

---

# Topic Creation Gate

A new Event Topic should only be created when sufficient semantic evidence exists.

Typical evidence includes:

- multiple corroborating Events
- sufficient semantic similarity
- multiple supporting Articles

or

a sufficiently strong Event:

- multiple Articles
- multiple sources
- meaningful title
- sufficient Event strength

Repeated named entities may also contribute to Topic creation.

Creating Topics too aggressively leads to semantic fragmentation.

---

# Behavioral Topics

Behavioral Topics are generated independently from Events.

Pipeline:

```
Engaged Articles
        ↓
Behavioral profiles
        ↓
Semantic communities
        ↓
Evidence checks
        ↓
Create or update Behavioral Topic
        ↓
Persist ArticleTopic evidence
```

Behavioral Topics require:

- repeated engagement
- sufficient engagement score
- semantic similarity
- minimum evidence
- behavioral breadth

One accidental click should never create a durable Topic.

---

# Hybrid Topics

Hybrid is a supported persisted type for combined Event and behavioral evidence.
Current normal crawl and calibration services do not automatically convert Topic types.

They allow recurring news and recurring interests to converge.

Hybrid Topics should evolve gradually.

They should never replace Event Topics unnecessarily.

---

# Topic Assignment

Event assignment considers only:

- Event Topics
- Hybrid Topics

Pure Behavioral Topics are intentionally excluded.

Behavioral Topics must never steal Event ownership.

---

# Topic Evolution

Existing Topics should almost always be updated instead of recreated.

Typical updates include:

- last activity
- behavioral activity
- semantic vector drift
- statistics
- EventTopic relationships
- ArticleTopic relationships

Topics are intended to preserve semantic identity over time.

---

# Vector Drift

Topic vectors may evolve gradually.

Vector updates should:

- use blending
- preserve historical identity
- avoid abrupt changes

Replacing Topic vectors outright should be avoided.

---

# Source of Truth

Topic relationships are stored in relationship tables.

## Event relationships

```
EventTopic
```

is the source of truth.

```
Event.topicId
```

stores only the primary Topic.

---

## Article relationships

```
ArticleTopic
```

is the source of truth.

```
Article.topicId
```

stores only the primary Topic.

---

Relationship tables are authoritative.

The *.topicId columns cache the primary relationship for efficient querying.

Never update them without updating their relationship tables.

---

# Statistics

Topic statistics are derived.

Typical statistics include:

- Event count
- Article count
- last activity
- behavioral evidence

Statistics should always be recomputed from relationship tables.

They should never become independent sources of truth.

---

# Architectural Boundaries

Topics consume semantic evidence.

They do **not** redefine lower semantic layers.

Events determine:

- what happened

Topics determine:

- what recurring subject it belongs to

Interest Islands determine:

- what the user consistently cares about

Responsibilities should remain clearly separated.

---

# Explainability

Every Topic assignment should be explainable.

The system should be able to answer:

- Why was this Event assigned to this Topic?
- Why was this Article linked to this Behavioral Topic?
- Why was a new Topic created?
- Why did this Topic evolve?

Explainability is a core design goal.

---

# Coding Principles

- Keep Topic algorithms inside semantic services.
- Keep Event and Behavioral Topic generation independent.
- Reuse shared vector helpers.
- Reuse shared creation gates.
- Reuse shared assignment helpers.
- Preserve deterministic processing.
- Keep thresholds configurable.
- Preserve concise debug logging.

---

# Common Regression Traps

Avoid introducing changes that:

- create a Topic for every Event
- allow Behavioral Topics to own Events
- bypass EventTopic or ArticleTopic
- recreate Topics unnecessarily
- overwrite vectors instead of blending
- remove conservative creation gates
- ignore behavioral evidence thresholds
- make incremental processing differ from rebuilds
- Lower layers never depend on higher layers
- Higher layers consume lower layers
- No semantic layer may redefine the responsibility of another layer
- Incremental processing and rebuilds should converge to the same semantic state

---

# Definition of Done

A Topic change is complete when:

1. Event Topics remain conservative.
2. Behavioral Topics represent repeated user engagement.
3. Hybrid Topics correctly bridge both evidence types.
4. Relationship tables remain the source of truth.
5. Topic identity is preserved through gradual evolution.
6. Topic assignments remain explainable.
7. Incremental processing and rebuilds converge toward the same semantic state.
8. Relevant tests continue to pass or are updated accordingly.

## Subject-aware Event assignment

Event/Hybrid candidate retrieval retains the existing 300-candidate bound and
primary/secondary thresholds: `PRIMARY_TOPIC_THRESHOLD=0.76` and
`SECONDARY_TOPIC_THRESHOLD=0.62`. Non-incremental scopes add 0.01 and 0.02
respectively, capped at 0.999. Database candidates are ordered by `updatedAt DESC`,
then `id ASC`; supplied caches retain their order and are capped at 300 per
evaluation. The batch scope may preload a larger Topic cache. Generated labels
and Topic names are not candidate-matching inputs.
The earliest linked source Event's name anchors a Topic's subject; rebuilds capture
these anchors before clearing EventTopic rows. Newly created Topics expose their
source Event transiently until their relationships have been persisted.

The shared policy extracts conservative named-subject hints from raw Event names,
reusing occurrence feature extraction without reusing Event rejection policy.
Generic news words and months are excluded. Version numbers, lifecycle actions,
and dates do not conflict at Topic level. Distinct explicit locations do separate
unrelated incident subjects. Existing anchor-Event membership can preserve its
own Topic even when the title has no extracted named subject. Identical generic
wording across different Events is not sufficient evidence.

Reuse requires durable subject overlap (or the existing anchor Event itself)
plus the existing semantic gate.
The 0.50 identity fallback remains available only with subject evidence; its
relationship confidence is half cosine, it stays secondary, and it cannot drift
the Topic vector. Normal primary/secondary confidence remains cosine. The existing
persistence thresholds cannot promote these weak relationships to primary.

Two eligible candidates with a cosine margin strictly below 0.04 remain ambiguous/unassigned.
A similarly close pair without subject evidence also remains unassigned when the
incoming Event has no informative entity. No new Topic is created for that ambiguity.
Empty EventTopic/ArticleTopic assignments are supported by the existing schema.

New Topic seeds pass the same subject test before vector averaging. Strong-Event
creation gates otherwise remain unchanged. Vector-prefix hashes may be stored as
keys but cannot bypass subject checks. The deterministic extractor is deliberately
limited; unsupported names/languages may lose continuity and need further gold cases.

Debug/report diagnostics contain scalar candidate similarity, threshold results,
entity overlap, member Event count, rank, winner margin, relationship/confidence,
and reason codes. Reports show the first eight ranked candidates plus any other selected
or ambiguous candidates, with an omitted count. No vectors, bodies or generated
labels are used as identity evidence. Classification of assignment outcomes is
separate from downstream recommendation scoring.

### Relationship confidence and downstream use

At most `MAX_TOPICS_PER_ARTICLE` (default 5) assignments survive. Ordinary
secondary-or-better matches take precedence over identity fallback. Without any
ordinary match, only the best subject-supported fallback survives as secondary.
A secondary-only result leaves the cached primary `topicId` null while retaining
its relationship row. Ordinary confidence is cosine rounded to four decimals;
fallback confidence is half cosine. These values are bounded by the similarity
range, not calibrated probabilities.

EventTopic confidence is copied into ArticleTopic for canonical Event members;
behavioral ArticleTopic evidence is preserved. Behavioral Topic calibration has
its own cosine-based article relationships and remains a separate service, not a
normal crawl stage. ArticleTopic stores confidence, not a separate similarity.
[Island scoring](../islands/README.md#confidence-aware-interest) respects the complete
ArticleTopic → IslandTopic confidence chain instead of forwarding raw Island weight.

### Creation, vectors, and names

The source anchor is the earliest linked Event by ID, not a generated Topic label.
Orion OS versions, Project Nova lifecycle changes, Lyra Air product evolution and
monthly security updates can reuse a subject despite being separate Events.
Unrelated incidents in different explicit locations cannot reuse solely because
both describe a collision. Unsupported entity extraction can still cause splits.

Qualified seed Event vectors are averaged on creation. Event-topic vector drift
is disabled by default (`TOPIC_VECTOR_DRIFT_ENABLED=false`). When enabled, only an
incremental primary match with similarity at most
`TOPIC_VECTOR_DRIFT_MAX_SIMILARITY` (0.92) drifts: it blends using
`TOPIC_VECTOR_ALPHA` (0.08), then limits that movement with
`TOPIC_VECTOR_DRIFT_ALPHA` (0.03). Identity fallback never drifts the vector.
This is an update constraint, not a persisted cohesion or drift-detection score.

Deterministic names summarize source titles; existing creation gates may inspect
those names for meaningful/repeated terms. Optional `generatedName` is presentation
metadata. Neither generated labels nor Topic.name provide independent matching or
ranking evidence. No new inference call is used for subject checks.

### Diagnostics and regression contract

`TOPIC_DEBUG=true`, `EVENT_DEBUG=true`, `SEMANTIC_REPORT_LEVEL=trace|report`, or a
subscriber to `rssmonster.topics.decisions` enables decision diagnostics. Candidate
fields include Topic ID/name, similarity, primary/secondary threshold results,
actual identity-fallback usage, overlapping entity names, member Event count, rank,
relationship type, confidence and reasons; the decision includes winner margin
and outcome. Reasons include `durable_entity_match`, `existing_event_membership`,
`semantic_primary_match`, `semantic_secondary_match`, `identity_fallback`,
`weak_generic_similarity`, `insufficient_subject_identity`,
`different_incident_subject`, and `ambiguous_topic_candidates`.

The [semantic Topic gold tests](../../tests/semantic/README.md) assert durable
continuity, separate incident/generic subjects, long-running reuse, mixed-case
entities, ambiguous nonassignment, confidence propagation, seed selection, and
label independence. Controlled vectors isolate policy; model fixtures provide a
separate, imperfect integration check. Do not hardcode Topic IDs.
