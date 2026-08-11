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
Interest Islands. Smart Folders provide a separate, deterministic way to build
focused views using search rules.

Start with [Concepts](concepts.md) for the broader philosophy and terminology.
For implementation-level details about the semantic pipeline, service
boundaries, thresholds, and maintenance processes, see
[Semantic Services Implementation](semantic-services-implementation.md).
