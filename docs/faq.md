---
layout: page
title: FAQ
nav_order: 7
---

## What makes RSSMonster different from other RSS readers?

RSSMonster is a **signal-driven RSS reader**. It offers chronological ordering
alongside transparent Quality, Recommended, and Top Stories modes.

Traditional readers answer:
> “What’s new?”

RSSMonster can also answer:
> “What is valuable, relevant to me, or important right now?”

---

## Is RSSMonster an algorithm deciding what I see?

Yes — but **you control it**.

RSSMonster composes visible signals such as article quality, FeedTrust,
freshness, personal interest, reading attention, and Event corroboration. Each
ranking mode gives those signals a specific meaning.

There is:
- No black-box personalization
- No external tracking
- No advertising incentives

Everything can be inspected, filtered, or overridden.

---

## Can I disable ranking and use RSSMonster like a classic RSS reader?

Yes.

You can:
- Sort by date (`sort:desc`)
- Ignore quality or trust thresholds
- Use Smart Folders that behave like traditional views

RSSMonster does not force ranking — it *enables* it.

---

## Why are some articles hidden or ranked very low?

The selected sort determines ordering. Recommended can place an article later
because of weak or negative personal interest, age, Quality, or limited Event
corroboration. Top Stories emphasizes Event evidence, freshness, and Quality;
Quality emphasizes article quality and FeedTrust. Newest and Oldest remain
chronological unless the optional legacy high-trust preference is enabled.

Filters and automated actions are separate from sorting and can exclude an
article from a view. Duplicate and Event grouping can also show one
representative first while keeping the related sources available.

---

## Why do I sometimes see only one article for a big news story?

RSSMonster uses **semantic clustering**.

If multiple feeds publish the same story:
- They are grouped into a single cluster
- You see the best or most original article first
- You can expand the cluster to view all sources

This reduces noise from syndication.

---

## What is a cluster, exactly?

A cluster represents **one story or topic** covered by multiple articles.

Clusters allow RSSMonster to:
- Reduce repetition
- Compare originality
- Track engagement at the story level
- Rank coverage, not just posts

---

## How is article quality calculated?

Article quality is a normalized score (0.0 – 1.0) based on:

```text
articleQuality =
    0.50 × qualityScore
  + 0.25 × sentimentScore
  + 0.25 × advertisementScore
```

The inputs use `0`–`100` and the result is normalized to `0`–`1`. The
advertisement component scores the absence of promotional content, so higher
is better. Quality ordering then combines `70%` article quality with `30%`
FeedTrust.

Quality is used for ranking, filtering, and automation — not censorship.

---

## What does “uniqueness” mean?

Uniqueness measures **how much new information** an article adds compared to others in the same cluster.

The signal is higher for original reporting than for:
- Rewrites
- Syndicated copies
- Press-release clones

---

## How does feed trust work?

Feed trust estimates how consistently valuable a source has recently been as a
source of articles.

It is based on:
- Average existing article quality
- Supporting engagement among exposed articles
- Originality based on actual duplicate links
- Explicit negative feedback

It is not factual verification, crawl health, topic interest, or a reward for
publishing frequently. Trust improves ranking reliability but never fully hides
content.

---

## Why doesn’t feed trust update immediately?

Feed trust is recalculated from a rolling 30-day evidence window.

It updates in batches to:
- Reuse the same transparent evidence model for every feed
- Keep sparse signals close to neutral through per-signal confidence
- Produce the same result when unchanged data is recalculated

You can manually recalculate trust using:

```bash
npm run feedtrust
```

[Read the complete FeedTrust explanation →](feedtrust.md)
