# AGENTS.md

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

Hybrid Topics emerge when Behavioral evidence accumulates around an existing semantic Topic.

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