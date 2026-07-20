# AGENTS.md

# RSSMonster Semantic Architecture

This document defines the semantic architecture of RSSMonster.

The semantic system transforms raw RSS articles into increasingly stable and meaningful representations.

```
Article
    ↓
Event
    ↓
Topic
    ↓
Interest Island
```

Each layer has a single responsibility.

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

Events group multiple genuinely similar Articles into a single real-world news story.

Events are:

- time-aware
- short-lived
- evidence-based
- order-independent

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

Unlike Events and Topics:

- completely user-specific
- highly stable
- evolve slowly
- drive personalization

Interest Islands consume:

- behavioral article evidence
- persisted Topics
- historical user behavior

---

# Semantic Compression

Every layer summarizes the layer below.

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

The semantic pipeline always flows in one direction.

```
Articles
    ↓
Event creation and assignment
    ↓
Topic assignment
    ↓
Behavioral topic generation
    ↓
Interest Island generation
    ↓
Article interest scoring
```

Downstream systems consume upstream results.

Higher layers must never redefine lower layers.

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

Interest Islands require repeated behavioral evidence.

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

Semantic processing should produce the same result regardless of:

- crawl order
- publication order
- processing batches
- repair runs

Incremental processing and rebuilds should converge toward the same semantic state.

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