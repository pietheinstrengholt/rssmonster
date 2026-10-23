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

| Concept | Meaning | Use |
| --- | --- | --- |
| Overall article quality (`articleQuality`) | Article content quality, independent of source trust and personal interest. | Overall quality badge and article-quality thresholds, including `quality:` expressions. |
| FeedTrust | Recent source value in the user's account. | Source contribution to Quality & source trust ranking. |
| Personal interest (`interestScore`) | Signed relevance to the user. | Personalization contribution to Recommended. |
| Semantic affinity (`semanticAffinityScore`) | Continuous confidence-adjusted affinity to the strongest positive Interest Island. | Independent stored signal; Recommended weight 0.10 by default. |

**Quality & source trust** ranking combines 70% articleQuality with 30% FeedTrust.
Recommended has no direct Quality contribution by default; quality sorting and
eligibility remain separate. These ranking combinations do not change Overall quality badges
or Article-only quality thresholds. A high-quality article may come from an
inconsistent source or cover a subject the user dislikes.

## Core Signals

### Overall article quality

Overall article quality asks: **How good is this particular article?**

It is a normalized `0.0`–`1.0` content score derived from the article's stored
quality, tone, and advertising scores. Feed reputation is not inserted
into the article-level value.

```text
articleQuality =
    0.50 × qualityScore
  + 0.25 × toneScore
  + 0.25 × advertisementScore
```

The persisted inputs use `0`–`100`; the result is clamped to that range and
divided by `100` once. A missing component uses the neutral-good value `70`.
Higher `advertisementScore` means less promotional content, so all three inputs
have the same higher-is-better direction.

The article badge, Settings → Scores → Overall quality, and Smart Folder Overall quality
control show this score out of 100. The badge preserves fractional points so that
an article shown as 74.75 does not appear to meet a minimum of 75. Badges,
accessible labels, breakdown footers, and quality-filter preview chips retain
fractional points and omit unnecessary trailing zeros. Badge colors use the
unrounded score, including near the 60 and 80 severity boundaries. Smart Folder
expressions retain their normalized syntax: `quality:>=0.75` means at least 75/100.
Settings stores the independent `minOverallQualityScore` threshold as an integer
from 0 to 100, with 0 disabling that gate. Existing writing, tone, and ad-free
thresholds remain separate additional filters under Advanced. Existing preferences
are preserved by the migration; the new overall threshold starts at 0.
Article scoring uses the configured inference service, with local models or a
compatible remote provider. OpenAI is not required. Classification supplies the
scores; generation supplies summaries and tags in the combined Article analysis.
Administrators can inspect availability in Settings → AI / Inference.

New articles start with fallback component scores of 70, subject to Action-owned
overrides. These defaults are not an AI assessment. When analysis is skipped,
retained scores remain subject to thresholds. Missing/nonfinite components also
use 70 when computing article quality. An all-70 component set does not show an
Overall quality badge, regardless of analysis status.

When analysis is pending, processing or failed, inferred scores and tags are hidden.
These states are exempt from thresholds on inference-owned components. Action-owned
Writing quality and Ad-free content overrides remain subject to their respective
thresholds; an override of either also removes the Overall quality exemption.
Other visibility rules still apply. This analysis-state policy is separate from
numeric fallback values.

The existing source-aware ranking remains separate: its menu label is
**Quality & source trust**. Top Stories retains its Quality weight; Recommended
has no direct Quality contribution by default.
“High overall quality” uses the article-only score, never the Recommended score.

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
fallback preserves unrepresented likes/saved/dislikes with recency and intent
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
ranking. **Prioritize trusted feeds in Unread** is an optional override that
can blend bounded FeedTrust into these chronological modes; when disabled,
ordering is strictly by publication time and stable article ID. This preference
does not change Recommended, Top Stories, or Quality & source trust ordering.
It differs from Briefing’s **Use Recommended ordering for summary**, which uses
Recommended scores to order summary stories and leaves article list ordering unchanged.

### Quality & source trust

**Quality & source trust** (`sort:quality`) ranking combines the value of the individual article with the source's
recent record:

```text
Quality = 0.70 × articleQuality + 0.30 × feedTrust
```

The formulas retain the internal symbol `Quality` for this source-aware score.
The two inputs remain independently visible and conceptually distinct.
**Overall quality** names the article-only score and its filters. **Writing
quality** names only the `qualityScore` component. UI controls and badges use
0–100; search expressions use the normalized 0–1 score. For example,
`quality:>=0.75` requires Overall quality of at least 75/100, independently of
source trust. Query preview chips label the filter **Overall quality** and the
sort **Quality & source trust**; the `quality` and `sort:quality` identifiers
remain unchanged.

### Semantic affinity

`semanticAffinityScore` measures the strongest positive Island contribution using the
quadratic contribution:
`q = clamp(positivePreferenceStrength × islandConfidence × max(0, cosineSimilarity)², 0, 1)`; `semanticAffinityScore = round4(max(q1, ..., qN))`.
It is threshold-free and excludes Article-to-Article fallback. It uses every eligible
positive Island. One positive Island can produce affinity. With no
supported positive contribution, the evaluated result is zero. The nullable FLOAT
starts null and is cleared by duplicate invalidation or semantic reset. All computed
values are finite in [0,1]; they are confidence-adjusted signals, not probabilities.
Affinity excludes freshness, Feed trust or Article quality.

Normal scoring, expiry refresh and explicit recalculation persist both scores
atomically per update with their existing shared evaluation clock. An explicitly
requested `recommendations:recalculate -- --userId=1 --allHistory` refreshes read,
unread and saved history in bounded batches without regenerating embeddings or
rebuilding Islands. This mode skips unsupported embeddings, leaving their existing
scores untouched; a skipped affinity remains null rather than claiming a successful
zero. Checkpoints support resumption with the same evidence and evaluation clock.
See [maintenance commands]({% link npm-commands.md %}) for scope and restart rules.
There is no automatic startup backfill.

### Recommended

Recommended consumes the two stored personalized signals independently:
`interestScore` supplies established signed preference and behavioral evidence,
`semanticAffinityScore` supplies continuous strongest positive affinity.
Their calculation and storage are unchanged. Affinity does not change
Briefing eligibility, Smart Folder query semantics or learned-preference labels.

Recommended is personalized. Its bounded base score combines:

```text
Recommended =
    0.60 × positiveInterest
  + 0.10 × semanticAffinityScore
  + 0.17 × freshness
  + 0.10 × corroboration
  - 0.30 × negativeInterest
  + ruleMatchBoost
  + hotBoost
```

First normalize finite `interestScore` to `[-1, 1]`, or use zero when missing or
nonfinite. Then `positiveInterest = max(interestScore, 0)`,
`negativeInterest = max(-interestScore, 0)`, and a matching rule contributes
`0.08` once regardless of how many rule tags match. The final result retains
negative totals and is capped at `1`. With these normalized inputs and weights,
the range is `-0.30`–`1`. Null affinity contributes zero without changing
the stored values; no normalization by Island count or total ranking weight occurs.
Recommended sorting and API serialization preserve the sign; the presentation label
uses the same signed score on a percentage scale, not a probability.

The authoritative implementation is
[`recommendedScore.js`](https://github.com/pietheinstrengholt/rssmonster/blob/master/server/services/recommendations/recommendedScore.js).
Semantic confidence modifies interest; it is not another final weight.

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
| Semantic affinity | Optional persisted values; null/missing contributes zero. |
| Article quality components | No default ranking contribution; Quality metadata/rollback retain the existing fallback of 70. |
| FeedTrust | Unavailable trust (missing, null, or nonfinite) uses the neutral prior 0.75; finite estimated values, including zero, remain meaningful. |
| Freshness | Article model uses zero for missing publication time; a plain object without freshness uses 0.5. |
| Matching rule tags | Optional; no boost without a match. |

Recommended is computed at runtime. The separate interest updater processes
canonical, unfiltered, unread Articles; that update scope does not restrict runtime
Recommended ranking to unread or Island-matched Articles.

Quality has no direct default Recommended weight, and FeedTrust adds no separate
raw boost. This gives personalization, freshness and corroboration control of
Recommended while retaining **Quality & source trust** as the dedicated quality
sort. Quality metadata, query quality filters and configured minimum-score gates
remain unchanged. Quality may still affect eligibility; it does not re-enter
through freshness, corroboration, rule/Hot boosts or Feed balancing. Existing
user Actions can still set rule/Hot status independently of the ranking formula. Event coverage,
cross-source evidence, and event size are not separate Recommended terms;
corroboration is its only Event-derived contribution.

### Recommended configuration and rollback

Coefficients are read once at process startup from server environment variables.
Each accepts a finite number in `[0,1]`, including zero; missing, blank or invalid
values fall back independently to the defaults below. Weights are not normalized.
Restart the server and workers after changing them.

| Variable | Default |
| --- | ---: |
| `RECOMMENDED_INTEREST_WEIGHT` | 0.60 |
| `RECOMMENDED_AFFINITY_WEIGHT` | 0.10 |
| `RECOMMENDED_FRESHNESS_WEIGHT` | 0.17 |
| `RECOMMENDED_CORROBORATION_WEIGHT` | 0.10 |
| `RECOMMENDED_NEGATIVE_INTEREST_WEIGHT` | 0.30 |
| `RECOMMENDED_QUALITY_WEIGHT` | 0.00 |

Rollback to the previous formula by setting `RECOMMENDED_QUALITY_WEIGHT=0.13`,
`RECOMMENDED_AFFINITY_WEIGHT=0`, retaining
the other defaults. This restores the existing Quality calculation (including
FeedTrust) without changing any persisted scores or requiring a migration.
Rule and Hot bonuses remain 0.08 and 0.07; the final upper cap remains 1 and
negative totals remain signed. Configurable weights also govern API explanation
contributions; zero-weight signals are omitted from promotion reasons.

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
  + hotBoost
```

Top Stories answers which current, corroborated Events matter broadly.
Recommended answers which articles are likely to matter to this user. Top
Stories does not use Interest Islands or rule tags. A standalone article
remains eligible and receives its freshness, Quality & source trust, and any Hot contribution.

Both sorts add a flat `hotBoost = 0.07` for [Hot articles]({% link hot-articles.md %})
when `hotInd` is set, otherwise zero.
The bonus does not scale with `hotlinks`. Existing weights and score caps remain
unchanged; Top Stories stays within `[0, 1]`.

### Supported sorts

The visible toolbar order is **Newest, Oldest, Top Stories, Recommended,
Quality & source trust**. These are the supported sorts for search and Smart Folder expressions.

Recommended, Top Stories, and Quality & source trust are computed across the complete eligible
candidate set before a result limit is applied. Equal scores fall back to
`publishedAt DESC`, then `id DESC`. These computed modes use a stable ordered ID
collection for incremental article loading rather than database cursor pages.

## Filters Versus Ranking

Ranking changes order. It does not make an otherwise ineligible article
eligible, and a low score does not delete or unsubscribe a source. Smart Folder
and search filters determine eligibility before runtime ranking is applied.

See the [Search Guide]({% link search.md %}) for the supported sort expressions and
[Smart Folders]({% link smart-folders.md %}) for reusable filtered views.

The forward-only `20261021000000-remove-multi-island-score.mjs` migration retires
the experimental additional-Island coverage column. Its former 0.05 ranking weight
is removed without redistribution. The two remaining stored scores are preserved;
no history rescore or embedding regeneration is needed. Previously applied add-column
migrations remain in the migration history.
