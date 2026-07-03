# Interest Island System

## Purpose

Interest Islands are the highest personalization layer in RSSMonster.

```text
Article
    ↓
Event
    ↓
Topic
    ↓
Interest Island
```

Articles describe individual news items.

Events describe one real-world news story.

Topics describe recurring semantic subjects.

Interest Islands describe **long-term user interests**.

Unlike Events and Topics, Interest Islands are completely user-specific.

Different users reading exactly the same feeds can therefore end up with completely different Interest Islands.

---

# What is an Interest Island?

An Interest Island is a durable cluster of related interests that emerges from a user's reading behavior.

Examples:

```text
Artificial Intelligence
Dutch Politics
Climate & Sustainability
Linux & Self-hosting
Photography
Cycling
```

An Island is not created because an article exists.

An Island is created because the user's behavior repeatedly demonstrates interest in related subjects.

---

# Design Principles

Interest Islands are intentionally:

* Personal
* Long-lived
* Stable
* Slowly evolving
* Behavior-driven

Unlike Events, they are not tied to a specific time window.

Unlike Topics, they are not intended to represent the news itself.

They represent the user's interests.

---

# Sources of Evidence

RSSMonster builds Interest Islands from two independent evidence sources.

## 1. Behavioral Articles

Direct article interactions.

Signals include:

* Positive feedback
* Starred articles
* Clicked articles
* Deep reading
* Negative feedback

These signals represent explicit user behavior.

---

## 2. Behavioral Topics

Existing Topics are also analyzed.

Instead of looking only at articles, RSSMonster also learns which Topics repeatedly attract user engagement.

This allows broader interests to emerge over time.

---

# Overall Processing Pipeline

The complete pipeline is:

```text
User behavior
        ↓
Behavioral Article Profiles
        ↓
Article Interest Islands
        ↓
Persist Islands
        ↓
Topic Enrichment
        ↓
Island ↔ Topic memberships
        ↓
Article Interest Scores
```

---

# Phase 1 — Behavioral Article Profiles

Files:

```text
services/islands/islandArticleProfiles.js
```

This phase converts user behavior into weighted behavioral article profiles.

Each engaged article receives:

* behavioral score
* normalized vector
* engagement signals
* publication timestamp

Articles with similar vectors are clustered into candidate Interest Islands.

The centroid of each cluster becomes the initial Island vector.

---

# Phase 2 — Persist Islands

Files:

```text
services/islands/islandPersistence.js
services/islands/islandMemberships.js
services/islands/islandAudit.js
```

Each generated Island profile is compared with existing Islands.

If a sufficiently similar Island already exists:

* update vector
* update behavioral signals
* update audit history
* evolve Topic memberships

Otherwise:

* create a new Interest Island.

Old inactive Islands are eventually archived instead of immediately deleted.

This keeps Interests stable over time.

---

# Phase 3 — Topic Enrichment

Files:

```text
services/islands/islandTopicProfiles.js
```

Once Islands exist, RSSMonster discovers which Topics belong to each Island.

Behavioral Topic Profiles are built using:

* Topic vectors
* Topic affinity
* User engagement
* Reading patterns
* Temporal engagement

Topics are clustered into behavioral communities.

Each Island is then linked with one or more Topics.

These memberships evolve gradually using blending and decay rather than being recreated every run.

---

# Phase 4 — Article Interest Scores

Files:

```text
services/islands/buildArticleInterestScores.js
```

Finally every unread article receives an Interest Score.

The preferred path is:

```text
Article
    ↓
Topic
    ↓
Island
```

If no Topic relationship exists, RSSMonster falls back to direct vector similarity between the Article and Island.

The strongest matching Island determines the final Interest Score.

This score can later be used for:

* ranking
* Smart Folders
* recommendations
* discovery
* personalized feeds

---

# Membership Evolution

Island memberships are intentionally stable.

Rather than replacing memberships every run, RSSMonster:

* blends confidence
* decays stale memberships
* removes only very weak relationships

This prevents Islands from changing drastically because of a few recently read articles.

---

# Population Audit

Every Island keeps a compact audit history.

The audit records:

* source Topics
* source Articles
* starred articles
* clicked articles
* negative articles
* population metrics

The audit exists purely for explainability and debugging.

It allows RSSMonster to answer:

> "Why does this Interest Island exist?"

without storing every historical article forever.

---

# Design Philosophy

Interest Islands are the user's long-term interest memory.

Events answer:

> What happened?

Topics answer:

> What recurring subject is this?

Interest Islands answer:

> What does this user consistently care about?

The goal is not to model the news.

The goal is to model the user's interests, allowing RSSMonster to personalize ranking, discovery, Smart Folders and recommendations while remaining stable over months or years.