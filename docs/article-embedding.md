---
layout: page
title: Article Embedding
parent: How RSSMonster Works
nav_order: 3
---

# Article Embedding

RSSMonster can turn an article's text into an embedding: a numerical
representation of its meaning. Articles about the same subject can therefore
be compared even when they use different words.

Embeddings provide evidence for RSSMonster's semantic features. They do not
change the article text, summarize it, or assign it to a category by
themselves.

## Where Embedding Happens

Article embedding is part of the post-crawl semantic pipeline:

```text
Extract and normalize the feed entry
        |
        v
Resolve article identity and deterministic duplicates
        |
        v
Apply deterministic rules and filters
        |
        v
Persist the article and enqueue optional enrichment atomically
        |
        v
Generate its embedding
        |
        v
Semantic duplicate detection
        |
        v
Events and Topics
        |
        v
Interest Island scoring
```

This order is important. An embedding does not replace RSSMonster's normal
article identity and revision checks. Semantic similarity is considered only
after those deterministic checks, and similar articles are not automatically
treated as duplicates.

Article summaries, inferred tags, and inferred scores are handled by the
worker's optional `processing_jobs` loop after persistence. They do not delay
embedding. The worker pauses new optional claims while the critical post-crawl
pipeline is active, preserving the ordered embedding → Event → Topic → Island
scoring path.

After a normal crawl, RSSMonster limits semantic processing to the users and
new articles touched by that crawl. Existing vectors are reused rather than
requested again.

## What Text Is Embedded

RSSMonster prepares two related text representations for an article.

### Event representation

The primary representation is designed to answer: **what happened in this
article?** It can contain:

- a normalized title;
- a usable description or summary; and
- up to two substantial paragraphs from the plain-text body.

Common news prefixes such as `Breaking`, `Update`, `Live`, and `Exclusive` are
removed from the title, as are common source-name suffixes. URLs, subscription
prompts, advertising labels, and similar boilerplate are removed from the
text. RSSMonster also removes repeated or nearly identical sentences across
the title, description, and body.

The resulting input is capped at an estimated 512 tokens. By default, an input
shorter than 60 characters is skipped because it is unlikely to provide a
useful semantic signal.

This vector is saved on the article as `articleVector`, together with the name
of the embedding model that produced it. It is the vector reused by later
semantic processing.

### Topic representation

When sufficient plain-text body content is available, RSSMonster also creates
a longer, topic-oriented representation. It uses substantial body paragraphs,
up to 2,200 characters, and requires at least 120 characters of usable text.
Content that still appears to contain raw HTML is rejected.

The topic vector is a processing input rather than a second stored article
vector. It helps the semantic pipeline consider the article's broader subject
when the vector is first generated. Durable Topics are subsequently built and
maintained from Event vectors; see [Topics](topics.md).

## Generation and Storage

Article embeddings use the model selected by the standalone inference service:
OpenAI `text-embedding-3-small` or local Qwen. The server contains no provider
credential. See [Model Usage](model-usage.md) for configuration and the warning
about incompatible embedding spaces.

For batch processing, RSSMonster only selects articles that are:

- owned by the user being processed;
- canonical rather than deterministic duplicates;
- not filtered;
- missing an existing article vector; and
- from a feed for which embedding generation is enabled.

Processing uses stable, ID-ordered batches. The default batch size is 200, and
the standalone recent-article backfill defaults to articles created within the
last seven days. These operational defaults can be tuned with
`ARTICLE_EMBED_BATCH_SIZE` and `ARTICLE_EMBED_MAX_AGE_DAYS` respectively.

If no API key is configured, the text is too short, usable plain text is not
available, or the provider request fails, RSSMonster skips the embedding. The
article remains available as a normal RSS article.

## Per-Feed Control

Embedding generation is enabled by default for each feed. To change it:

1. Open the feed's settings.
2. Find **Generate embeddings**.
3. Select **Yes** or **No**.

This setting is separate from **Apply AI analysis**. AI analysis produces
lightweight derived data such as summaries, tags, and scores; embedding
supports semantic comparison and clustering.

Turning embedding generation off prevents RSSMonster from creating missing
vectors for that feed. It does not delete vectors that have already been
stored.

## How the Vector Is Used

The stored article vector contributes to several features:

- **Semantic duplicate detection** compares bounded candidate sets after
  deterministic identity checks.
- **Events** combine semantic similarity with headline, entity, source, and
  time evidence to group reporting about the same occurrence. An Event vector
  is derived from the vectors of its member articles. See [Events](events.md).
- **Topics** connect recurring subjects across Events rather than treating
  every article as an isolated item. See [Topics](topics.md).
- **Interest Islands** use semantic evidence alongside explicit user behavior
  to model durable personal interests. See [Interest Islands](interest-islands.md).
- **Related-article recommendations** compare a source article with recent
  vectorized articles belonging to the same user. Articles already in the same
  Event are excluded from these recommendations.

These comparisons use cosine similarity, but a vector is only one signal in
the larger system. Event creation is conservative, Topics evolve gradually,
and Interest Islands depend primarily on user behavior. It is valid for an
article to have no vector, for a vectorized article to remain outside an Event,
or for a similarity search to return no recommendations.

## Historical Processing

Normal crawl processing is incremental. After a large import, an embedding or
clustering change, or a semantic-data repair, an administrator can run the
historical semantic rebuild from the `server` directory:

```bash
npm run semantic:all
```

To process one user only:

```bash
npm run semantic:all -- --userId=3
```

The Event stage of this command processes articles that already have stored
vectors; it does not backfill missing article embeddings. It then rebuilds
Topics, Interest Islands, and interest scores from the available semantic
data.
