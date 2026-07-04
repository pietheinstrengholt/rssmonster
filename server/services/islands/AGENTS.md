# AGENTS.md

# Interest Island System

This document defines how RSSMonster builds and maintains Interest Islands.

```
Article
    ↓
Event
    ↓
Topic
    ↓
▶ Interest Island
```

Interest Islands are the highest semantic layer in RSSMonster.

They represent long-term user interests rather than the news itself.

Unlike Events and Topics, Interest Islands are completely user-specific.

---

# Purpose

Interest Islands answer a single question:

> **What does this user consistently care about?**

Examples:

```
Artificial Intelligence

Linux & Self-hosting

Photography

Climate & Sustainability

Electric Vehicles
```

An Interest Island is **not**:

- a news story
- a Topic
- a feed category
- a semantic cluster of Articles

It represents a durable area of user interest.

---

# Design Principles

Interest Islands are intentionally:

- personal
- long-lived
- stable
- behavior-driven
- slowly evolving

Interest Islands should survive individual reading sessions and short-term news cycles.

They model persistent interests that emerge over weeks or months.

---

# Sources of Evidence

Interest Islands consume two complementary evidence layers.

## Behavioral Articles

Direct user engagement.

Signals may include:

- starred articles
- clicked articles
- deep reading
- positive feedback
- negative feedback

These signals provide the strongest evidence of user interest.

---

## Topics

Interest Islands also consume persisted Topics.

These Topics summarize recurring semantic subjects discovered earlier in the pipeline.

Using Topics allows Islands to become broader and more stable than individual Articles.

Topics enrich Interest Islands.

They do not create them independently.

---

# Processing Pipeline

Interest Island generation follows a deterministic pipeline.

```
User Behavior
        ↓
Behavioral Article Profiles
        ↓
Candidate Islands
        ↓
Persist Islands
        ↓
Topic Enrichment
        ↓
Island ↔ Topic Relationships
        ↓
Article Interest Scores
```

Each stage builds upon the previous one.

Higher stages should never redefine lower semantic layers.

---

# Phase 1 — Behavioral Article Profiles

User engagement is converted into behavioral profiles.

Each profile typically contains:

- engagement score
- normalized vector
- publication time
- behavioral signals

Profiles are temporary processing artifacts.

They are not persisted.

---

# Phase 2 — Candidate Islands

Semantically similar behavioral profiles are clustered.

Each cluster becomes a candidate Interest Island.

Candidate Islands exist only during processing.

They become durable only after persistence.

---

# Phase 3 — Island Persistence

Each candidate Island is compared against existing Islands.

If a sufficiently similar Island already exists:

- update the vector
- update behavioral evidence
- update memberships
- update audit history

Otherwise:

- create a new Interest Island

Existing Islands should almost always evolve rather than be recreated.

When duplicate normalized island names exist:

1. Compare semantic similarity.
2. If similarity is high:
   - treat as duplicate and update/merge/prevent creation.
3. If similarity is low:
   - allow both.
   - keep the broader name for the stronger island.
   - rename the smaller or newer island with a distinguishing keyword phrase.

---

# Phase 4 — Topic Enrichment

Once Islands exist, persisted Topics are evaluated.

Topics that consistently relate to an Island become members of that Island.

Typical evidence includes:

- semantic similarity
- behavioral affinity
- user engagement
- temporal consistency

Island ↔ Topic memberships evolve gradually over time.

---

# Phase 5 — Article Interest Scoring

Finally unread Articles receive an Interest Score.

Preferred path:

```
Article
    ↓
Topic
    ↓
Interest Island
```

If no Topic relationship exists:

```
Article
        ↓
Vector similarity
        ↓
Interest Island
```

Direct vector comparison is a fallback.

Topic-based matching is preferred because it is more stable and explainable.

---

# Membership Evolution

Interest Island memberships should evolve slowly.

Prefer:

- confidence blending
- gradual decay
- incremental updates

Avoid:

- replacing memberships
- rebuilding Islands every run
- abrupt changes

Small behavioral changes should not significantly alter long-term interests.

---

# Population Audit

Every Interest Island maintains a compact audit history.

Typical information includes:

- contributing Topics
- contributing Articles
- behavioral evidence
- population metrics

The audit exists solely for explainability.

It should never become semantic evidence itself.

The system should be able to answer questions such as:

- Why does this Interest Island exist?
- Which Topics contributed?
- Which Articles strengthened it?

---

# Interest Scores

Interest Scores represent how strongly an Article aligns with a user's long-term interests.

Interest Scores are derived.

They should never become semantic evidence themselves.

They are intended for:

- ranking
- Smart Folders
- recommendations
- personalized discovery

---

# Source of Truth

Island relationships are stored in relationship tables.

```
IslandTopic
```

is the durable relationship between Islands and Topics.

Relationship tables remain the source of truth.

Derived scores, audits and statistics should never replace them.

---

# Architectural Boundaries

Interest Islands consume semantic knowledge.

They do **not**:

- cluster Articles
- create Events
- create Topics
- redefine semantic relationships

Events determine:

- what happened

Topics determine:

- what recurring subject it belongs to

Interest Islands determine:

- what consistently interests this user

These responsibilities should remain clearly separated.

---

# Explainability

Every Interest Island decision should be explainable.

The system should be able to answer:

- Why was this Topic added to this Island?
- Why did this Island evolve?
- Why did this Article receive a high Interest Score?
- Why does this Island represent this user's interests?

Explainability is a core architectural goal.

---

# Coding Principles

- Keep Island algorithms inside semantic services.
- Consume existing semantic layers rather than rebuilding them.
- Prefer Topic-based matching over direct vector matching.
- Reuse shared vector helpers.
- Blend vectors gradually.
- Preserve deterministic processing.
- Keep thresholds configurable.
- Preserve concise debug logging.

---

# Common Regression Traps

Avoid introducing changes that:

- create Islands from too little behavioral evidence
- recreate Islands every processing run
- replace memberships instead of blending them
- use audit history as semantic evidence
- bypass IslandTopic relationships
- ignore Topic enrichment
- rely solely on direct vector matching
- make incremental processing behave differently from rebuilds
- Lower layers never depend on higher layers
- Higher layers consume lower layers
- No semantic layer may redefine the responsibility of another layer
- Incremental processing and rebuilds should converge to the same semantic state

---

# Definition of Done

An Interest Island change is complete when:

1. Islands represent durable user interests.
2. Island creation requires sufficient behavioral evidence.
3. Existing Islands evolve gradually rather than being recreated.
4. Topic enrichment strengthens Island semantics.
5. Article Interest Scores remain stable and explainable.
6. Relationship tables remain the source of truth.
7. Incremental processing and rebuilds converge toward the same semantic state.
8. Relevant tests continue to pass or are updated accordingly.