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

# Event Lifecycle

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

1. Ensure a usable Event embedding exists.
2. Search nearby candidate Events.
3. If a sufficiently similar Event exists:
   - join that Event.
4. Otherwise search nearby candidate Articles.
5. Include both:
   - assigned Articles
   - unassigned Articles
6. If assigned Articles consistently point to one Event:
   - join that Event.
7. If enough similar unassigned Articles exist:
   - create a new Event.
8. Otherwise:
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
- representative article
- article count
- source count
- source diversity
- event window
- event strength
- lifecycle status

The in-memory cache and persisted database state must remain consistent.

---

# Event Cache

Event processing is intentionally cache-driven.

During one assignment run, recent Events are loaded into memory.

The cache exists only for the lifetime of the processing scope.

It is never persisted.

The cache should be updated immediately whenever:

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

---

# Event Repair

RSSMonster supports multiple Event assignment scopes.

## Incremental

Used during normal feed crawling.

Processes only recent unassigned Articles.

---

## Recent Repair

Used after threshold or algorithm improvements.

Rebuilds only a configurable recent time window.

---

## Full Rebuild

Used after major semantic changes.

Rebuilds all historical Event assignments.

---

# Vector Handling

Normalize vectors once before entering the cache.

Do not repeatedly normalize vectors during matching.

Similarity calculations should reuse normalized vectors.

Avoid recomputing embeddings or normalization inside matching loops.

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