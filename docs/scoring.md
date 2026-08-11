---
layout: page
title: Feed Scoring
parent: How RSSMonster Works
nav_order: 2
---

# Feed Scoring

RSSMonster assigns each subscribed feed a trust score between `0.0` and `1.0`.
The score estimates how useful that source is to the current user based on
recent publishing behavior and reading interactions.

Feed trust is not a fact-checking score and does not claim that every article
from a high-scoring feed is correct. It is also distinct from crawl health and
article quality:

- **Feed trust** measures source usefulness, originality, consistency, and
  user affinity.
- **Crawl health and reliability** describe whether RSSMonster can fetch the
  feed successfully.
- **Article quality** evaluates an individual article's content signals.

Feed scores are user-specific because feeds and their article interactions are
stored per user.

## The Observation Window

Each recalculation examines articles published by the feed during the previous
30 days. Older articles do not affect the new observation, which lets the score
adapt when a source changes while preventing its entire history from
dominating forever.

If a feed has no articles in that window, RSSMonster keeps its existing trust
and attention metrics unchanged.

## Inputs to Feed Trust

RSSMonster derives the observed score from three positive dimensions and
several penalties.

### Originality

Originality uses RSSMonster's event relationships to estimate whether a feed
often provides representative reporting or repeats coverage found elsewhere.

For recent articles assigned to events, RSSMonster considers:

- the proportion selected as the representative article for their event;
- the average number of articles in those events; and
- the proportion belonging to events with at least two articles.

An article in a single-article event is treated as original for this
calculation. Articles in events containing two or more articles contribute to
the feed's duplication rate. Larger event clusters and a high duplication rate
reduce originality, while frequently supplying the representative article
raises it.

Event membership is semantic evidence, not deterministic duplicate identity.
A lower originality contribution therefore means that the source commonly
covers stories also covered elsewhere; it does not necessarily mean that its
articles are literal copies.

### Engagement

Engagement measures how the user responds to recent articles from the feed.
Each article can contribute:

| Signal | Contribution |
| --- | ---: |
| Favorite/bookmark | `1.0` |
| One or more outbound clicks | `0.5` |
| Skimmed, attention bucket 1 | `0.25` |
| Read, attention bucket 2 | `0.75` |
| Deep read, attention bucket 3 | `1.25` |
| Highly engaged, attention bucket 4 | `1.75` |

The combined contribution of one article is capped at `2.5`. RSSMonster then
averages these contributions across every recent article from the feed and
normalizes the result to the `0.0`–`1.0` range. Feeds that publish many ignored
articles therefore do not receive the same engagement signal as feeds whose
articles are regularly saved, opened, or read.

See [Bookmarks](bookmarks.md) for why favorites are particularly useful as an
explicit interest signal.

### Publishing Consistency

Consistency is based on recent publication frequency. It rises linearly until
the feed reaches four articles per day, where this contribution is fully
satisfied. This rewards sources that publish consistently without giving an
unbounded advantage to very high-volume feeds.

### Negative Feedback and Volume

The observed score can be reduced by:

- articles explicitly marked **Not Interested**;
- very high publishing volume; and
- recent feed-mute history.

The high-volume penalty starts above 25 articles per day and reaches its
maximum at 50 or more articles per day. It can reduce the observed score by up
to 15%. Negative feedback uses a gradual square-root penalty, also capped at
15%, so a small amount of feedback matters without letting a few observations
overwhelm the entire score. Recent mute history can apply a further penalty of
up to 10%.

## How the Score Is Combined

The scoring calculation starts from a neutral observation of `0.75` and makes
bounded adjustments:

```text
observed trust = 0.75
  + (originality - 0.50) × 0.10
  + (engagement - 0.35) × 0.35
  + (consistency - 0.25) × 0.08
```

The result is clamped to `0.0`–`1.0`, after which volume, negative-feedback,
and mute penalties are applied.

Engagement has the largest positive influence. Originality and consistency
move the result more gently, so a feed is not rewarded merely for publishing
frequently or being the only source covering a story.

## Confidence for New and Small Feeds

RSSMonster avoids making strong judgments from very small samples:

- 10 or fewer recent articles have zero sample confidence;
- confidence increases linearly from 10 to 100 articles; and
- 100 or more recent articles provide full sample confidence.

The observed result is blended toward the neutral `0.75` baseline according to
that confidence. A small feed can still accumulate useful metrics, but a short
run of articles cannot immediately push its trust score to an extreme.

New feed records begin with a stored score of `0.5`. Recalculation moves that
stored value gradually toward the confidence-weighted observation.

## Smoothing Over Time

After confidence weighting, RSSMonster applies an exponential moving average:

```text
new trust = 0.35 × new observation + 0.65 × previous trust
```

Only 35% of one recalculation comes from the latest observation. The other 65%
comes from the previous stored score. This makes feed trust responsive over
time but resistant to sudden spikes, sparse data, and one unusually good or
bad batch of articles.

## Attention Metrics Stored with the Score

The same recalculation stores additional per-feed behavior metrics:

- average attention among articles that received an attention bucket;
- deep-read ratio;
- skim ratio;
- ignored-article ratio;
- average clicks per article;
- proportion of articles receiving at least one click; and
- number of attention samples.

These metrics help RSSMonster estimate reading affinity for new, unread
articles from the feed. They are supporting observations and should not be
confused with the final trust score itself.

## Recalculating Feed Scores

Feed trust is calculated as a batch operation rather than after every click or
read. This keeps the score stable and avoids expensive recalculation during
normal reading.

From the interface:

1. Open **Settings → Feeds**.
2. Select **Recalculate Scores**.

The interface recalculates active feeds owned by the signed-in user and then
reloads the feed table. The table displays each feed's trust score separately
from its crawl reliability.

For a command-line installation, run from the `server` directory:

```bash
npm run feedtrust
```

The command processes all active feeds. Run it periodically with the scheduler
appropriate to your installation if you want scores refreshed automatically.

## How Feed Trust Affects RSSMonster

### Trust Sorting

Use the Trust sort in the interface or this search expression:

```text
sort:trust
```

Articles are ordered by feed trust from highest to lowest, then by newest
publication date and article ID. Trust sorting changes order; it does not hide
articles from lower-scoring feeds.

See the [Search Guide](search.md) for combining Trust sorting with other
filters or using it in a Smart Folder.

### Article Quality

Feed trust and duplication history can gently adjust an article's computed
quality after a feed has enough attention samples. Confidence begins above 10
attention samples and reaches full strength at 100.

At full confidence, feed evidence can boost the article-quality multiplier by
up to 10% or reduce it by up to 15%. The feed duplication rate contributes a
penalty of up to 10%. The final multiplier remains bounded between `0.85` and
`1.10`, so feed reputation refines article quality rather than replacing the
article's own content signals.

Because article quality is one input to Recommended ranking, this creates a
small indirect feed-trust influence even when explicit trust prioritization is
disabled.

### Prioritize High-Trust Coverage

The Unread and Daily Briefing preferences include **Prioritize high-trust
coverage**. When enabled, RSSMonster adds the feed's bounded trust score during
runtime ordering. This makes trusted feeds more prominent in Recommended and
other supported ordering modes without imposing a minimum-trust cutoff.

The setting affects priority, not eligibility: relevant coverage from a
lower-scoring feed can still appear.

### Trusted-Source Signal

Articles from feeds with a trust score above `0.85` can display a **Trusted
source** signal. This is a product-level indication that the feed has developed
strong behavioral trust; it is not an independent verification of the
article's factual accuracy.

## Interpreting Feed Trust

Feed trust is most useful comparatively: it helps answer which subscribed
sources have recently been original, consistently useful, and engaging for a
particular user. Avoid treating small score differences as precise judgments.
Sample size, recent behavior, and smoothing deliberately make the score evolve
over multiple recalculations.

Most importantly, a low trust score does not remove a feed or filter its
articles. RSSMonster keeps the underlying sources accessible and uses trust as
one transparent signal among article quality, freshness, personal interest,
event coverage, source diversity, and corroboration.
