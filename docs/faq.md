---
layout: page
title: FAQ
---

## What makes RSSMonster different from other RSS readers?

RSSMonster is a **signal-driven RSS reader**.  
Instead of showing articles purely in chronological order, it ranks them by **importance** using quality, uniqueness, freshness, and feed trust.

Traditional readers answer:
> “What’s new?”

RSSMonster answers:
> “What actually matters?”

---

## Is RSSMonster an algorithm deciding what I see?

Yes — but **you control it**.

RSSMonster uses transparent, deterministic scoring based on:
- Article quality
- Originality
- Feed trust
- Freshness
- Your own engagement

There is:
- No black-box personalization
- No external tracking
- No advertising incentives

Everything can be inspected, filtered, or overridden.

---

## Can I disable ranking and use RSSMonster like a classic RSS reader?

Yes.

You can:
- Sort by date (`sort:DESC`)
- Ignore quality or trust thresholds
- Use Smart Folders that behave like traditional views

RSSMonster does not force ranking — it *enables* it.

---

## Why are some articles hidden or ranked very low?

Articles may rank lower when they:
- Are near-duplicates of other articles
- Come from low-trust feeds
- Have low writing quality
- Are old or stale
- Provide little original information

Nothing is deleted automatically unless you create a rule that does so.

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
- Writing structure
- Promotional language detection
- Sentiment neutrality
- Content richness

Quality is used for ranking, filtering, and automation — not censorship.

---

## What does “uniqueness” mean?

Uniqueness measures **how much new information** an article adds compared to others in the same cluster.

Original reporting ranks higher than:
- Rewrites
- Syndicated copies
- Press-release clones

---

## How does feed trust work?

Feed trust is a long-term score (0.0 – 1.0) earned over time.

It is based on:
- Originality of published articles
- Average quality
- User engagement (reads, clicks, stars)
- Consistency of publishing

Trust improves ranking reliability but never fully hides content.

---

## Why doesn’t feed trust update immediately?

Feed trust is designed to be **stable**, not reactive.

It updates in batches to:
- Avoid spikes
- Prevent gaming
- Reflect long-term behavior

You can manually recalculate trust using:

```bash
npm run feedtrust
```