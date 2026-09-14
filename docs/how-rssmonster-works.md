---
layout: page
title: How RSSMonster Works
nav_order: 4
has_children: true
---

# How RSSMonster Works

RSSMonster turns a stream of feed entries into an organized, prioritized, and
personal reading experience. It combines deterministic article processing,
source-level signals, semantic relationships, and each user's reading behavior.

The major concepts build on one another:

```text
Article embedding ─→ Event
Candidate Article vector ─→ direct Island comparison
       ├───────────────────────────→ direct Island match
       └───────────────────────────→ explicit behavioral fallback
                                           ↓
                                confidence-aware interest
                                           ↓
Recommended ← freshness, Quality (including FeedTrust), corroboration, rule boost
```

Islands form from user behavior and match candidates directly. The arrows above show
scoring paths; an Article need not traverse every layer. Unmatched personal evidence
is neutral, and every eligible Article still receives Recommended. See
[Interest Islands]({% link interest-islands.md %}) and [Scoring]({% link scoring.md %})
for confidence and coverage distinctions.

## Worker and Pipeline Architecture

The MySQL and PM2 production topology separates scheduled crawling from optional
generated enrichment:

```text
rssmonster-worker
 └─ crawl scheduler loop
      └─ crawl → embedding → events → island scoring

rssmonster-ai-worker
 └─ claim processing_jobs
      ├─ summaries
      ├─ quality scoring
      ├─ inferred tags
      └─ semantic labels
```

The lightweight SQLite Compose profile starts only `rssmonster-worker` and has
AI processing disabled. It does not start `rssmonster-ai-worker` or consume
optional processing jobs.

The crawl scheduler owns the ordered, deterministic semantic path. Article
identity and revision resolution happen before persistence; embeddings then
complete before Event creation and Interest Island scoring.
These stages are never moved into the optional queue.

The AI worker consumes durable database jobs after their article,
Event, or Island target exists. New and revised articles are immediately
persisted with deterministic provider, feed, rule, and manual tags. When article
analysis is enabled, the article and its `article_enrichment` job commit in the
same transaction. Summaries, inferred tags, and inferred scores can therefore
finish later without delaying crawling or embedding.

Article analysis moves through `pending`, `processing`, `complete`, `skipped`,
or `failed`. Pending, processing, and failed articles remain readable and are
not rejected by inferred-score thresholds merely because placeholder scores are
present. Deterministic advertisement and bad-quality action scores retain their
configured threshold behavior in every analysis state. The interface shows an
analyzing state instead of presenting placeholders as completed inference.

Jobs contain identifiers and version guards rather than article text. Handlers
reload the current user-owned target and recheck article content hashes while
holding the write lock, so an older job cannot overwrite a newer revision.
Article enrichment replaces only inferred tags. Semantic-label jobs update only
generated presentation fields; deterministic Event and Island fallback
names remain usable while labels are pending or failed.

Every scheduled, manual, and API-triggered crawl publishes its own renewable
database lease while its critical semantic pipeline is active. The AI worker
pauses new claims while any such lease is live; concurrent crawls do not exclude
one another, and already-running optional work is allowed to finish safely.
Inside the local inference service, waiting embedding requests
outrank classification and generated text requests. Running model calls are not
preempted.
Retryable inference failures use leases and bounded backoff, exhausted jobs are
dead-lettered, and expired leases are recoverable. Failures in optional work do
not fail crawling or deterministic semantic processing. See [Crawling]({% link crawling.md %}#durable-optional-processing-queue)
for queue states, concurrency, observability, shutdown, and operator recovery.

## Key Concepts

### Actions

[Actions]({% link actions.md %}) apply your rules to incoming articles during a
crawl. When an article matches a regular expression, RSSMonster can assign a
tag, mark it as a favorite or read, override a score, or hide it from normal
queries. For example, automatically tag articles mentioning Verstappen or save
Nintendo and Zelda news to Favorites. These rules do not require AI processing.

### Official Feeds

[Official Feeds]({% link official-feeds.md %}) identify articles whose URLs match
organization domains you configure in **Settings → Official Sources**. During
crawling, matching articles receive an official-source indicator and the
organization name, helping you recognize direct announcements and updates.

### FeedTrust

[FeedTrust]({% link feedtrust.md %}) estimates how consistently valuable a subscribed
source has been as a source of articles. It combines recent article quality,
supporting engagement, deterministic originality, and explicit negative
feedback. It is separate from crawl reliability, personal interest,
article-level quality, and factual verification.

### Article Embedding

[Article Embedding]({% link article-embedding.md %}) represents an article's meaning as a
numeric vector. This lets RSSMonster compare articles semantically even when
they use different words. Embeddings support recommendations and the semantic
grouping layers; they do not alter or summarize the source article themselves.

### Events

[Events]({% link events.md %}) group articles that cover the same real-world occurrence.
This reduces repeated coverage in the reading stream while keeping the
different sources available. An Event answers: **what happened?**

### Interest Islands

[Interest Islands]({% link interest-islands.md %}) form the private, user-specific
personalization layer. They learn durable areas of interest from article
relationships and reading signals such as clicks, bookmarks, and explicit
feedback. An Interest Island answers: **what does this user consistently care
about?**

### Daily Briefing

[Daily Briefing]({% link daily-briefing.md %}) combines a recent article collection
with a short overview of current event stories. Use **Tune your briefing** to
change the lookback period, unread and interest filters, developing coverage,
and minimum number of sources.

### Scoring and Ranking

[Scoring and Ranking]({% link scoring.md %}) explains how article quality, FeedTrust,
freshness, personal interest, attention, and Event evidence remain separate and
are composed by Quality, Recommended, and Top Stories ordering.

## Putting the Layers Together

RSSMonster first fetches and normalizes articles while preserving their
identity and source. Feed and article signals help rank what should be shown.
When semantic processing is enabled, article embeddings help associate reports
with Events and relate that content to a user's
Interest Islands. Optional generated summaries, scores, inferred tags, and
presentation labels can arrive afterward without changing that semantic order.

Start with [Concepts]({% link concepts.md %}) for the broader philosophy and terminology.
For implementation-level details about the semantic pipeline, service
boundaries, thresholds, and maintenance processes, see
[Semantic Services Implementation]({% link semantic-services-implementation.md %}).
