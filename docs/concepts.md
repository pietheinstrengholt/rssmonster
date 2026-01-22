---
layout: page
title: Core Concepts
---

## RSSMonster’s Philosophy

RSSMonster treats RSS not as a chronological inbox, but as an **information ranking problem**.

Modern RSS usage suffers from:
- Repeated coverage of the same stories
- Syndication noise
- Uneven source quality
- Ever-growing unread backlogs

RSSMonster addresses this by introducing **signals**, **scores**, and **intent-driven views** — while remaining fully self-hosted and under your control.

---

## Articles

An **article** is a single item fetched from an RSS or Atom feed.

In RSSMonster, articles are more than raw entries:
- They are analyzed for quality
- Compared against other articles for uniqueness
- Ranked relative to time, trust, and engagement

Articles remain immutable: RSSMonster never rewrites or alters feed content.

---

## Clusters (Stories)

RSSMonster groups similar articles into **clusters** using semantic similarity.

A cluster represents:
- One story
- One topic
- One news event covered by multiple sources

### Why clustering matters

Clustering allows RSSMonster to:
- Collapse duplicate coverage
- Reduce noise from syndication
- Compare originality between sources
- Rank *stories* instead of posts

Reading one article contributes to reading the entire cluster.

---

## Quality

Each article receives a **quality score** between `0.0` and `1.0`.

Quality reflects:
- Writing structure and clarity
- Promotional language detection
- Sentiment neutrality
- Content richness

Quality is not a value judgment — it is a signal used for:
- Ranking
- Filtering
- Automation rules

---

## Uniqueness

Uniqueness measures how much **new information** an article adds relative to others in the same cluster.

Articles rank higher when they:
- Provide original reporting
- Add context or analysis
- Are not near-duplicates

Syndicated copies and rewrites score lower, even if published later.

---

## Freshness

Freshness measures how recent an article is, normalized over time.

Freshness:
- Decays smoothly
- Never drops to zero instantly
- Is balanced against quality and trust

This prevents “latest wins” behavior while still surfacing breaking news.

---

## Feed Trust

Feed trust is a long-term score (`0.0 – 1.0`) earned by each source.

Trust reflects:
- Originality of published articles
- Average quality
- User engagement (reads, clicks, stars)
- Publishing consistency

Trust is **earned over time**, not configured manually.

High-trust feeds influence ranking more, but never silence others.

---

## Engagement Signals

RSSMonster learns from *how you actually read*.

Engagement signals include:
- Reading time
- Scroll-based mark-as-read
- Clicks
- Starred articles

These signals are aggregated to:
- Improve feed trust
- Stabilize ranking
- Reduce noise over time

RSSMonster does not track behavior externally.

---

## Importance

**Importance** is a runtime score that determines article ranking.

It combines:
- Freshness
- Quality
- Uniqueness
- Feed trust

Importance answers:
> “How likely is this article worth my attention right now?”

It is recalculated dynamically, not stored permanently.

---

## Smart Folders

Smart Folders are **declarative, dynamic views** built from search expressions.

They:
- Replace static folders
- Encode intent
- Update automatically

Example:

```text
@today unread:true cluster:true sort:IMPORTANCE
```

Smart Folders allow you to define what matters — not just what arrived.

## Automation & Actions

RSSMonster supports **automated actions** using regular expressions and signals.

Actions can:

- Star articles  
- Mark articles as read  
- Delete low-quality content  
- Flag advertisements  

Automation works **with scoring, not against it**.  
Instead of relying on fragile keyword rules alone, actions can be combined with quality, freshness, and trust signals to reduce noise safely.

---

## Transparency by Design

RSSMonster is built on transparent principles:

- No black-box algorithms  
- No external tracking  
- No advertising incentives  
- No forced personalization  

Every decision can be:

- Inspected  
- Filtered  
- Overridden  

You decide how much automation and ranking you want — nothing is hidden or imposed.

---

## Who These Concepts Are For

These concepts matter most if you:

- Follow many overlapping sources  
- Care about signal over volume  
- Want control over ranking  
- Prefer explainable systems  

If you only follow a few feeds, RSSMonster will still work — but its strengths shine at scale.

---

## Summary

RSSMonster introduces:

- Clusters instead of repetition  
- Signals instead of guesses  
- Ranking instead of inboxes  
- Control instead of magic  

It is not a replacement for RSS.

It is RSS — taken seriously.

