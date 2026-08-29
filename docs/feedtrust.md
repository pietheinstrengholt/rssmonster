---
layout: page
title: FeedTrust
parent: How RSSMonster Works
nav_order: 2
---

# FeedTrust

FeedTrust is RSSMonster's user-specific estimate of **how consistently valuable
a subscribed source has been as a source of articles**. Every feed has a score
from `0.0` to `1.0`.

The score summarizes recent source value. It is not:

- factual-accuracy verification;
- crawl-health or delivery-reliability scoring;
- a measure of how often the source publishes;
- a personal topic-interest score;
- a penalty for covering events that other publishers also cover; or
- a reflection of whether the feed is muted.

[Article quality](scoring.md#article-quality) asks how good one particular
article is. FeedTrust asks whether the source has produced consistently
valuable articles across its recent history. Interest Islands and Recommended
ranking remain responsible for personal topic relevance.

## Recent Evidence Window

Recalculation examines articles published by the feed during the previous 30
days. Older history falls out naturally as the window moves.

The score is calculated directly from the current evidence. It does not blend
the result with the previously stored score, so running recalculation twice over
unchanged data produces the same FeedTrust.

## The Four Components

FeedTrust combines four normalized components:

```text
feedTrust =
    0.50 × effectiveAverageArticleQuality
  + 0.20 × effectiveEngagement
  + 0.15 × effectiveOriginality
  + 0.15 × effectiveNegativeFeedbackQuality
```

The result is bounded to `0.0`–`1.0`. There are no extra bonuses or penalties
for volume, event size, representative-article selection, mute history, or how
often the recalculation job runs.

### Average article quality — 50%

This is the average of the existing normalized article-quality value for recent
articles with usable analysis. FeedTrust reuses that canonical value; it does
not reproduce or alter the article-quality formula.

Articles whose quality analysis is unavailable are excluded from this
component. Missing scores are handled through confidence instead of invented
quality values.

### Engagement — 20%

Engagement is supporting evidence that articles proved useful to the user. It
uses the existing signals:

| Signal | Engagement points |
| --- | ---: |
| Favorite or bookmark | `1.0` |
| At least one outbound click | `0.5` |
| Attention bucket 1 | `0.25` |
| Attention bucket 2 | `0.75` |
| Attention bucket 3 | `1.25` |
| Attention bucket 4 | `1.75` |

One article contributes at most `2.5` points. The average is normalized to
`0.0`–`1.0`.

Only meaningfully exposed articles form the denominator: articles marked read,
or articles with an attention bucket, click, favorite, or explicit negative
action. A large unread backlog therefore does not automatically make a source
look less valuable merely because the user could not consume every item.

### Originality — 15%

Originality uses RSSMonster's persisted duplicate relationship:

```text
actualDuplicateRate =
  articles with duplicateOfArticleId / duplicate-eligible articles

originality = 1 - actualDuplicateRate
```

This is deliberately different from semantic event grouping. Articles from
several publishers may cover the same Event while remaining independently
valuable reports. Event membership, Event size, and representative status do
not count as duplicate evidence for FeedTrust.

### Negative-feedback quality — 15%

Explicit negative actions provide direct evidence that exposed articles were
not valuable:

```text
negativeFeedbackQuality =
  1 - negative exposed articles / meaningfully exposed articles
```

Using the exposure denominator prevents hundreds of untouched articles from
diluting several explicit negative signals.

## Evidence Confidence

Each component has its own confidence. An uncertain observation is blended
toward the neutral value `0.75` before the four components are combined:

```text
effective component =
    0.75 × (1 - confidence)
  + observed component × confidence
```

Confidence grows linearly and reaches full strength at:

| Component | Full-confidence target |
| --- | ---: |
| Average article quality | 4 usable quality-scored articles |
| Engagement | 8 meaningfully exposed articles |
| Originality | 8 duplicate-eligible articles |
| Negative-feedback quality | 8 meaningfully exposed articles |

This is intentionally evidence-aware rather than based on publication count
alone. A high-quality weekly source can establish strong FeedTrust, while a
high-volume source does not gain trust merely by publishing often. With no
usable evidence, every component resolves to `0.75`, so FeedTrust does too.

## Stored Supporting Metrics

The same batch also refreshes feed-level attention and click statistics:

- average attention among measured articles;
- deep-read and skim ratios;
- ignored-article ratio;
- average clicks and clicked-article ratio; and
- attention sample count.

These fields help predict reading affinity for new unread articles. They are
not additional FeedTrust bonuses or penalties.

## How FeedTrust Is Used

FeedTrust remains separate from article quality, but the **Quality** ranking
combines both:

```text
Quality = 0.70 × articleQuality + 0.30 × feedTrust
```

Recommended and Top Stories consume this combined Quality signal at their own
documented weights. FeedTrust therefore has a bounded, indirect influence; it
does not determine eligibility and never hides a source by itself.

The legacy `sort:trust` expression is retained as an alias for `sort:quality`.
It does not mean a pure FeedTrust-only ordering.

Articles whose FeedTrust is strictly greater than `0.85` can display a
**Trusted source** signal. This indicates strong source value under the model,
not independent verification of an article's claims.

## Recalculation

From **Settings → Feeds**, select **Recalculate Scores**. Administrators can
also run the batch from the `server` directory:

```bash
npm run feedtrust
```

The interface recalculates active feeds owned by the signed-in user. The CLI
recalculates all active feeds. Existing scores adopt the current model when
recalculated.
