# AGENTS.md

# Event System

This document defines how RSSMonster groups individual Articles into semantic Events.

```
Article
    ↓
▶ Event
    ↓
Topic
    ↓
Interest Island
```

Events represent **one real-world news story**.

They are the first semantic layer built from individual Articles.

Their purpose is to consolidate duplicate reporting while leaving genuinely unique stories untouched.

---

# Purpose

Events answer a single question:

> **What happened?**

An Event represents a single news story reported by one or more Articles.

Examples:

```
Apple announces new iPhone

Ukraine signs ceasefire agreement

Microsoft acquires startup X
```

An Event is **not**:

- a Topic
- a user interest
- a news category

It is one concrete occurrence in the real world.

---

# Design Principles

Events are intentionally:

- evidence-based
- short-lived
- time-aware
- deterministic
- order-independent

Events should only exist when multiple Articles genuinely describe the same story.

Standalone Articles should remain eventless.

---

# Core Invariants

These rules should never be violated.

## Do not create one-article Events

An Event requires corroborating evidence.

A single Article should keep:

```
eventId = null
```

until sufficient similar Articles exist.

---

## Articles may remain eventless

Not every Article belongs to an Event.

Unique news stories should remain standalone.

This is expected behavior.

---

## Event assignment must be order-independent

The final clustering result should not depend on:

- crawl order
- publication order
- processing batches
- incremental execution

Incremental assignment and full rebuilds should converge toward the same Event structure.

---

## Existing Events are preferred

Whenever sufficient semantic evidence exists, new Articles should join existing Events.

Creating a new Event is the fallback.

---

# Event Article Pointers

Events have two article pointers with distinct responsibilities.

## Stable representative

```
representativeArticleId
```

This is the semantic and stable event identity.

The stable representative is assigned when the Event is created. Normal incremental
processing must never replace a valid `representativeArticleId` when newer Articles
join the Event.

## Developing article

```
developingArticleId
```

This is the sticky canonical Article used to represent the current developing
coverage wave.

The developing pointer may move when newer canonical coverage joins an existing
Event. It is presentation state, not a replacement semantic identity for the Event.

A valid unread developing article is sticky. It must not be replaced by newly
linked Articles until it is read, invalid, or missing.

Existing Events may validly have:

```
developingArticleId = null
```

## Grouped-event mark-read cascade

When a user marks a grouped Event card as read with `grouping = event`, all
currently linked unread canonical Articles in the same Event become read as well.
An article-specific read with `grouping = none` never triggers this cascade.

Example before marking the grouped event read:

representativeArticleId = 100
developingArticleId = 100

article 100 = unread
article 101 = unread
article 102 = unread

After the existing grouped-event read operation:

article 100 = read
article 101 = read
article 102 = read

representativeArticleId = 100
developingArticleId = 100

## Developing wave when later coverage arrives

After the previous grouped event has been consumed:

representativeArticleId = 100
developingArticleId = 100

article 100 = read
article 101 = read
article 102 = read

Article 103 later joins:

article 103 = unread

Because the current developing article was read before Article 103 arrived:

article 100 readAt < article 103 createdAt

update:

developingArticleId = 103

Keep:

representativeArticleId = 100

Expected grouped unread behavior:

includeDevelopingEvents = false
    Use representativeArticleId.
    Article 100 is read.
    Event remains hidden.

includeDevelopingEvents = true
    Use developingArticleId.
    Article 103 is unread.
    Event appears once as a developing story.

Current read status alone is insufficient. If the current pointer was read only
after the incoming Article had already arrived, preserve the current pointer:

article 100 readAt >= article 103 createdAt

The front end displays the developing icon only while the pointed Article remains
unread. Reading the Article does not clear or replace `developingArticleId`.

If articles 104 and 105 arrive while article 103 remains unread:

developingArticleId remains 103

When the grouped event card represented by article 103 is marked read, the existing event-wide behavior marks:

article 103 = read
article 104 = read
article 105 = read

The pointer remains unchanged:

developingArticleId = 103

## Front-end mark-read context

The front-end communicates how the read action was initiated by passing the current grouping mode.

### grouping = none

The request represents a normal article read.

Behavior:

- Only the selected Article status changes.
- Other Event members remain unchanged.
- `developingArticleId` remains unchanged.

### grouping = event

The request represents the grouped Event card.

Behavior:

- All currently linked unread canonical Articles in the Event are marked read.
- `representativeArticleId` remains unchanged.
- `developingArticleId` remains unchanged.

A later unread canonical Article joining the Event starts the next developing coverage wave through the normal Event assignment process.

## Shared invariants

1. `representativeArticleId` is the stable event anchor.
2. `developingArticleId` is the moving Article used to present the latest canonical coverage for an existing Event.
3. Normal incremental processing may update `developingArticleId` but must never replace a valid `representativeArticleId`.
4. Article read status remains Article-specific.
5. Linking an Article to an Event must never inherit or rewrite the Article's status.
6. The developing-stories setting controls presentation only. It does not control whether `developingArticleId` is maintained.
7. Event lifecycle status and developing-story presentation are separate concepts.

Article status changes are grouping-aware. An article-specific read changes only the
selected Article and does not refresh the developing pointer. An event-grouped read
acknowledges every currently linked unread canonical member while preserving both
the stable representative and developing pointer.

---

# Event Lifecycle

Lifecycle status describes the Event's semantic age and activity. It does not select
the developing article and must not be used as a proxy for developing-story
presentation.

```
New Article
        ↓
Find matching Event
        ↓
Join existing Event
        ↓
OR
        ↓
Find corroborating Articles
        ↓
Create new Event
        ↓
OR
        ↓
Remain eventless
```

---

# Assignment Algorithm

For every Article:

1. Resolve or load the Article.
2. Reject missing and duplicate Articles before assignment work begins.
3. Resolve the Event vector:
   - prefer an explicitly supplied Event vector
   - otherwise use the persisted `articleVector`
4. If no usable vector exists:
   - follow the existing topic-only path
   - preserve the existing no-vector counters
5. Search nearby candidate Events.
6. If a sufficiently similar Event exists:
   - join that Event.
7. Otherwise search nearby candidate Articles.
8. Include both:
   - assigned Articles
   - unassigned Articles
9. If assigned Articles consistently point to one Event:
   - join that Event.
10. If enough similar unassigned Articles exist:
   - create a new Event.
11. Otherwise:
   - leave the Article eventless.

---

# Candidate Evidence

Event assignment uses multiple signals.

Semantic similarity is the primary signal.

Additional supporting evidence may include:

- headline similarity
- entity overlap
- temporal proximity
- source diversity

Semantic similarity alone should not automatically create an Event.

Multiple signals should corroborate the decision.

---

# Event Creation

A new Event should only be created when sufficient corroborating evidence exists.

Typical evidence includes:

- multiple similar Articles
- multiple independent publishers
- strong semantic similarity
- reasonable publication proximity

Creating duplicate Events should be avoided.

---

# Event Updates

Whenever an Article joins an Event, the Event must be updated.

Typical updates include:

- event vector
- developing pointer, when newer canonical coverage qualifies
- article count
- source count
- source diversity
- event window
- event strength
- lifecycle status

The stable representative must remain unchanged during these normal updates.
Maintaining the developing pointer is independent of whether the user enables
developing-story presentation.

The in-memory cache and persisted database state must remain consistent.

---

# Event Cache

Event processing is intentionally cache-driven.

During one assignment run, recent Events are loaded into memory.

The cache exists only for the lifetime of the processing scope.

It is never persisted.

The cache should be updated immediately after the corresponding database
transaction commits.

- an Article joins an Event
- a new Event is created
- an Event vector changes

---

# Article Candidate Cache

Recent Articles are also cached.

The cache should contain only the information required for semantic matching.

Typical fields include:

- identifiers
- timestamps
- normalized vectors
- token sets
- entity sets
- current eventId

Candidate lookup should be entirely in-memory.

Normal Event assignment should not perform database searches for every Article.

The historical preload should retain the newest bounded set of eligible Articles.

For each Article being assigned:

1. Collect eligible candidates within the hard ±24-hour Event window.
2. Rank candidates by absolute publication-time distance from the current Article.
3. Prefer candidates processed during the current run when time distance ties.
4. Apply the per-Article comparison cap only after relevance ordering.
5. Compare only the best 300 candidates.

After an Article is processed, add or update it in the current-run cache. This lets
later Articles from the same crawl use earlier Articles as corroborating evidence.
The candidate cap must never be applied before relevance ordering, because doing so
can hide highly similar current-run Articles behind older unrelated records.

---

# Event Repair

RSSMonster supports multiple Event assignment scopes.

## Incremental

Used during normal feed crawling.

Processes only newly created, canonical, unfiltered, unassigned Articles.

Article interaction status does not control semantic eligibility. `unread`, `read`,
`favorite`, and other non-duplicate statuses are eligible when the Article is in the
incremental scope. Event assignment must preserve the Article's existing status.

Incremental scope is based on `createdAt`, never `updatedAt`. Publisher revisions may
change `updatedAt`, but they must not re-enter the semantic pipeline as new Articles.

---

## Recent Repair

Used after threshold or algorithm improvements.

Rebuilds only a configurable recent time window.

---

## Historical Backfill

Used to fill missing Event assignments across all vectorized historical Articles.

This scope preserves existing Event assignments. It does not clear, reclassify, or
replace existing Events and must not be described as a full rebuild.

A future full rebuild must be implemented as an explicit replacement workflow.

---

# Vector Handling

Normalize vectors once before entering the cache.

Do not repeatedly normalize vectors during matching.

Similarity calculations should reuse normalized vectors.

Avoid recomputing embeddings or normalization inside matching loops.

An explicitly supplied Event vector takes precedence at the assignment entry point.
When no explicit vector is supplied, a persisted `articleVector` is valid Event
assignment input. Database-loaded Articles must not require callers to construct a
separate vectors object.

Event embedding input is structured as:

```text
Title: normalized Article title
Summary: unique Article description sentences
Body: up to two unique, meaningful early body paragraphs
```

Description and body text are considered independently. Exact and near-identical
sentences must be removed across sections so repeated publisher text is not
overweighted. The final Event embedding input is capped at 512 estimated tokens.

---

# Logging

Development logging should remain concise.

Typical log lines include:

```
[EVENT] article=421 → event=18 decision=existing-event sim=0.94
```

```
[EVENT] article=421 decision=new-event corroborated=3
```

At the end of every processing run, output a concise summary.

Typical metrics include:

- articles processed
- new Events
- existing Event assignments
- standalone Articles
- total Events

Never log full vectors.

---

# Source of Truth

Articles belong to Events through:

```
Article.eventId
```

Unlike Topics, Event membership does not currently use a relationship table.

An Event owns its member Articles.

All Event summary fields are derived from those Articles.

---

# Architectural Boundaries

Events are responsible only for grouping Articles.

Events do **not**:

- discover Topics
- model user interests
- personalize ranking
- score recommendations

Those responsibilities belong to higher semantic layers.

---

# Regression Traps

Avoid introducing changes that:

- create one-article Events
- force every Article into an Event
- make clustering dependent on crawl order
- apply the Article candidate cap before relevance ordering
- use Article read status as an Event-assignment filter
- repeatedly normalize vectors
- query the database during every Article comparison
- create duplicate Events
- ignore existing corroborating Articles
- leave Event metadata inconsistent with assigned Articles
- Lower layers never depend on higher layers
- Higher layers consume lower layers
- No semantic layer may redefine the responsibility of another layer
- Incremental processing and rebuilds should converge to the same semantic state

---

# Definition of Done

An Event change is complete when:

1. Similar Articles consistently cluster together.
2. Standalone Articles remain eventless.
3. Event assignment is deterministic.
4. Incremental processing and rebuilds converge toward the same result.
5. Event metadata remains synchronized with member Articles.
6. Cache and persisted state remain consistent.
7. Relevant tests continue to pass or are updated accordingly.
