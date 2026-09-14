---
layout: page
title: Scoring and Ranking
parent: How RSSMonster Works
nav_order: 7
---

# Scoring and Ranking

RSSMonster keeps several scoring concepts separate so each one has a clear
meaning. A score may describe one article, a source's recent history, personal
relevance, or the importance of a current story. No single score decides
whether an article is allowed to exist or be read.

## Core Signals

### Article quality

Article quality asks: **How good is this particular article?**

It is a normalized `0.0`–`1.0` content score derived from the article's stored
quality, sentiment, and advertising scores. Feed reputation is not inserted
into the article-level value.

```text
articleQuality =
    0.50 × qualityScore
  + 0.25 × sentimentScore
  + 0.25 × advertisementScore
```

The persisted inputs use `0`–`100`; the result is clamped to that range and
divided by `100` once. A missing component uses the neutral-good value `70`.
Higher `advertisementScore` means less promotional content, so all three inputs
have the same higher-is-better direction.

### FeedTrust

FeedTrust asks: **How consistently valuable has this source been as a source of
articles?**

It summarizes 30 days of article quality, supporting engagement, deterministic
originality, and explicit negative feedback. It is user-specific and remains
separate from factual verification, crawl health, and personal interest. See
[FeedTrust]({% link feedtrust.md %}) for the complete conceptual model.

### Freshness

Freshness is a time-decay value derived from publication time:

```text
freshness = exp(-ageInHours / 48)
```

A missing publication time produces zero. Intelligent ranking clamps the value
to `0`–`1`, which also prevents a future publication timestamp from producing
an out-of-range contribution.

### Personal interest

Interest is a bounded signed contribution from trusted personal evidence.
Island paths separate preference strength, Island confidence and relationship
confidence. Direct vectors determine Island relationships; explicit behavioral
fallback preserves unrepresented likes/favorites/dislikes with recency and intent
attenuation. The strongest positive and strongest negative contributions are
combined without blindly summing correlated paths. Positive interest promotes
relevant material; negative interest penalizes it. FeedTrust is separate.

The [internal interest-scoring reference](https://github.com/pietheinstrengholt/rssmonster/blob/master/server/services/islands/README.md#confidence-aware-interest)
is authoritative for those formulas. Weak relationships and singleton support
have less authority; missing evidence means exactly neutral interest. Unread or
missing engagement is not automatically a negative signal.

### Event evidence

Events contribute coverage, publisher diversity, and corroboration signals.
These describe how strongly a current occurrence is supported across articles
and sources. Event co-coverage is not FeedTrust duplication evidence.

```text
coverage        = clamp01(log2(max(eventArticleCount, 1)) / 6)
sourceDiversity = clamp01(ln(sourceCount + 1) / 2.56)
sourceSpread    = clamp01(log2(max(sourceCount, 1)) / log2(8))
crossSource     = max(sourceDiversity, sourceSpread)
corroboration   = coverage × crossSource
```

Counts are normalized to nonnegative finite values; `clamp01` maps nonfinite
values to zero and bounds finite values to [0,1]. These primitives are shared by
Recommended and Top Stories. An article without
an Event receives zero for every Event-derived value.

## Ranking Modes

### Chronological

`sort:desc` orders newest first and `sort:asc` orders oldest first. These modes
are available when users want a conventional RSS inbox without intelligent
ranking. The optional Unread high-trust preference is a legacy override that
can blend bounded FeedTrust into these chronological modes; when disabled,
ordering is strictly by publication time and stable article ID.

### Quality

Quality ranking combines the value of the individual article with the source's
recent record:

```text
Quality = 0.70 × articleQuality + 0.30 × feedTrust
```

The two inputs remain independently visible and conceptually distinct.

### Recommended

Recommended is personalized. Its bounded base score combines:

```text
Recommended =
    0.45 × positiveInterest
  + 0.25 × freshness
  + 0.20 × Quality
  + 0.10 × corroboration
  - 0.30 × negativeInterest
  + ruleMatchBoost
```

First normalize finite `interestScore` to `[-1, 1]`, or use zero when missing or
nonfinite. Then `positiveInterest = max(interestScore, 0)`,
`negativeInterest = max(-interestScore, 0)`, and a matching rule contributes
`0.08` once regardless of how many rule tags match. The final result is clamped
to `0`–`1`.

The authoritative implementation is
[`recommendedScore.js`](https://github.com/pietheinstrengholt/rssmonster/blob/master/server/services/recommendations/recommendedScore.js).
Phases A–C improved the quality of the interest input and preserved these final
weights. Semantic confidence modifies interest; it is not another final weight.

Every Article eligible under the caller's ownership, visibility and explicit
filters receives a finite Recommended score. No Event, Island, vector or
nonzero interest is required. The regression target is **100% Recommended
coverage**, while personalization coverage may legitimately be sparse.

| Input | Absent-value behavior |
| --- | --- |
| Authorized identity and view eligibility | Required by caller; never synthesized by ranking. |
| Interest | Optional; zero when missing or nonfinite. |
| Event/corroboration | Optional; zero without an Event. |
| Island, embedding | Optional; not Recommended prerequisites. |
| Quality components | Unavailable/nonfinite article components default to 70. |
| FeedTrust | Missing/nonfinite trust defaults to 0.5; finite stored values remain meaningful. |
| Freshness | Article model uses zero for missing publication time; a plain object without freshness uses 0.5. |
| Matching rule tags | Optional; no boost without a match. |

Recommended is computed at runtime. The separate interest updater processes
canonical, unfiltered, unread Articles; that update scope does not restrict runtime
Recommended ranking to unread or Island-matched Articles.

Because Quality already contains a bounded FeedTrust contribution, Recommended
does not add FeedTrust again as an independent raw boost. Event coverage,
cross-source evidence, and event size are not separate Recommended terms;
corroboration is its only Event-derived contribution.

### Top Stories

Top Stories is event-driven and non-personalized. It first derives Event
importance from coverage, cross-source evidence, and corroboration, then ranks:

```text
eventImportance =
    0.45 × coverage
  + 0.35 × crossSource
  + 0.20 × corroboration

Top Stories =
    0.60 × eventImportance
  + 0.25 × freshness
  + 0.15 × Quality
```

Top Stories answers which current, corroborated Events matter broadly.
Recommended answers which articles are likely to matter to this user. Top
Stories does not use Interest Islands or rule tags. A standalone article
remains eligible and can receive only its freshness and Quality contributions.

### Supported sorts

The visible toolbar order is **Newest, Oldest, Top Stories, Recommended,
Quality**. These are the supported sorts for search and Smart Folder expressions.

Recommended, Top Stories, and Quality are computed across the complete eligible
candidate set before a result limit is applied. Equal scores fall back to
`publishedAt DESC`, then `id DESC`. These computed modes use a stable ordered ID
collection for incremental article loading rather than database cursor pages.

## Filters Versus Ranking

Ranking changes order. It does not make an otherwise ineligible article
eligible, and a low score does not delete or unsubscribe a source. Smart Folder
and search filters determine eligibility before runtime ranking is applied.

See the [Search Guide]({% link search.md %}) for the supported sort expressions and
[Smart Folders]({% link smart-folders.md %}) for reusable filtered views.
