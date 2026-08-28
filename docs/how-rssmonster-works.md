---
layout: page
title: How RSSMonster Works
nav_order: 4
---

# How RSSMonster Works

RSSMonster turns a stream of feed entries into an organized, prioritized, and
personal reading experience. It combines deterministic article processing,
source-level signals, semantic relationships, and each user's reading behavior.

The major concepts build on one another:

```text
Feeds and articles
        |
        +--> Feed scoring
        |
        +--> Article embeddings --> Events --> Topics
                                      |          |
                                      +----------+--> Interest Islands

Search expressions --------------------------------> Smart Folders
```

## Worker and Pipeline Architecture

The MySQL and PM2 production topology separates scheduled crawling from optional
generated enrichment:

```text
rssmonster-worker
 └─ crawl scheduler loop
      └─ crawl → embedding → events → topics → island scoring

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
complete before Event creation, Topic assignment, and Interest Island scoring.
These stages are never moved into the optional queue.

The AI worker consumes durable database jobs after their article,
Event, Topic, or Island target exists. New and revised articles are immediately
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
generated presentation fields; deterministic Event, Topic, and Island fallback
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
not fail crawling or deterministic semantic processing. See [Crawling](crawling.md#durable-optional-processing-queue)
for queue states, concurrency, observability, shutdown, and operator recovery.

## Key Concepts

### Smart Folders

[Smart Folders](smart-folders.md) are saved, dynamic views powered by the same
expressions used by RSSMonster search. New articles appear automatically when
they match a folder's query, without moving or copying the articles from their
feeds.

### Feed Scoring

[Feed Scoring](scoring.md) assigns a user-specific trust score to each feed.
The score combines signals about the source and the user's interactions to help
prioritize useful material. It is separate from crawl reliability, article
quality, and factual verification.

### Article Embedding

[Article Embedding](article-embedding.md) represents an article's meaning as a
numeric vector. This lets RSSMonster compare articles semantically even when
they use different words. Embeddings support recommendations and the semantic
grouping layers; they do not alter or summarize the source article themselves.

### Events

[Events](events.md) group articles that cover the same real-world occurrence.
This reduces repeated coverage in the reading stream while keeping the
different sources available. An Event answers: **what happened?**

### Topics

[Topics](topics.md) connect related Events into broader, recurring subjects.
They persist beyond an individual story and answer: **what ongoing subject does
this belong to?**

### Interest Islands

[Interest Islands](interest-islands.md) form the private, user-specific
personalization layer. They learn durable areas of interest from article
relationships and reading signals such as clicks, bookmarks, and explicit
feedback. An Interest Island answers: **what does this user consistently care
about?**

## Putting the Layers Together

RSSMonster first fetches and normalizes articles while preserving their
identity and source. Feed and article signals help rank what should be shown.
When semantic processing is enabled, article embeddings help associate reports
with Events, connect Events to Topics, and relate that content to a user's
Interest Islands. Optional generated summaries, scores, inferred tags, and
presentation labels can arrive afterward without changing that semantic order.
Smart Folders provide a separate, deterministic way to build focused views
using search rules.

Start with [Concepts](concepts.md) for the broader philosophy and terminology.
For implementation-level details about the semantic pipeline, service
boundaries, thresholds, and maintenance processes, see
[Semantic Services Implementation](semantic-services-implementation.md).
