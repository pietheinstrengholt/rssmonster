# Crawl Architecture

Crawl is the system that keeps RSSMonster's article library current, clean, and useful. It turns external feed entries into trustworthy local articles while preserving user intent, avoiding duplicate noise, and preparing new content for search, reading, recommendations, and semantic organization.

This document describes what crawl is supposed to do. It is an architectural specification, not an implementation guide.

## Architectural Objective

Crawl must provide a reliable ingestion contract for feed content.

A crawl run represents:

- The user or users whose feeds are being refreshed.
- The feeds and entries being considered.
- The freshness boundary that decides whether an entry is still relevant to ingest.
- The article identity rules that prevent duplicate local records.
- The content normalization rules that make feed content safe and readable.
- The user-defined rules that can alter or reject incoming articles.
- The enrichment work that prepares saved articles for the rest of the product.
- The progress model that lets callers observe long-running ingestion.

The crawl system is responsible for combining those dimensions into one coherent library update.

## Core Principles

Crawl is user-scoped. Every persisted article, tag, rule effect, progress event, and downstream enrichment result must belong to the correct user context.

Crawl is idempotent in spirit. Re-seeing the same article should not create duplicate reading work for the user. Duplicate detection may use URL identity, title identity, content identity, or later semantic identity, but the product promise is that repeated feed entries do not repeatedly appear as new articles.

Crawl is conservative with untrusted content. Feed entries come from outside the application and must be treated as unsafe until normalized. Stored article content should be bounded, non-executable, and suitable for later rendering, search, and analysis.

Crawl is content-preserving where safe. The system should keep enough original structure for pleasant reading while also extracting plain text that supports language detection, duplicate detection, analysis, search, and scoring.

Crawl is observable. A refresh may touch many feeds and take meaningful time, so callers need progress, completion, and failure information rather than a silent background mutation.

Crawl is a gateway, not the whole intelligence layer. It prepares articles for semantic work, recommendations, duplicate marking, clustering, and scoring, but those concepts remain downstream product capabilities.

## Feed Entry Eligibility

An entry is eligible for ingestion only when it represents a usable article for the relevant feed and user.

The fundamental eligibility dimensions are:

- Ownership: the feed belongs to the user being crawled.
- Freshness: the entry is not older than the feed's configured crawl boundary.
- Addressability: the entry has a usable article URL.
- Content presence: the entry contains readable text, safe HTML, media content, or another supported article body.
- Local uniqueness: the article is not already represented in the feed or user's library according to article identity rules.
- User rules: no matching user rule rejects the article.

Eligibility is decided before expensive enrichment whenever possible. The system should avoid doing costly analysis for entries that will not be saved.

## Article Identity

Article identity answers the question "is this already in the library?"

RSS feeds are imperfect. The same article may appear with changed metadata, tracking parameters, slightly different titles, or duplicated content. Crawl should use normalized article concepts rather than raw feed fields alone.

URL identity is important because it reflects the publisher's intended location. Content identity is important because it catches repeated bodies when URLs vary. Title identity may help when feeds are inconsistent. No single signal is perfect; identity should be resilient to normal feed messiness.

When concurrent crawl work discovers the same article at the same time, the outcome should still be one persisted article. Losing a race to another crawler is not a product error; it means the article already exists.

## Content Normalization

Crawl turns feed content into two complementary forms:

- A safe readable representation for the article body.
- A plain-text representation for analysis, duplicate detection, language detection, search, and scoring.

Executable markup, unsafe embeds, unsafe attributes, unsafe URL protocols, oversized inline payloads, and other hostile or noisy content should not become stored article content.

Plain text should preserve the article's meaning while removing markup noise. It should be stable enough to support hashing and downstream analysis.

When a feed entry has no useful title, crawl may infer a better title from the article content. This is a reader-experience improvement, not a license to invent meaning that is not present in the entry.

When content cannot be fully parsed, crawl should degrade to a safe representation rather than fail the whole run unnecessarily.

## Media and Lead Images

Feeds may represent articles as text, HTML, media, or combinations of those. Crawl should preserve useful media signals and lead imagery when they help the reading experience.

Media should not replace richer article content when usable text or HTML is available. When media is the primary content, the system should still create a readable article representation if it can do so safely.

Lead images are article metadata. They should support browsing and reading, but they should not determine whether an otherwise valid article exists.

## User Rules

User rules are part of ingestion intent. They let users shape the library before articles become reading work.

Rules may:

- Reject an article.
- Mark an article read.
- Mark an article favorite.
- Mark an article as clicked or saved for later.
- Adjust quality or advertisement signals.
- Add tags.

Rejecting an article takes precedence over other rule effects because the article should not enter the library. Rule effects that change scores or states should be applied before persistence so saved articles already reflect the user's preferences.

Invalid user rules should not break the crawl. A bad rule should be isolated so the rest of the feed can still be processed.

## Analysis and Enrichment

Crawl may enrich saved articles with summaries, tags, quality scores, sentiment scores, advertisement scores, language, hotlink state, embeddings, duplicate markings, event assignments, topic assignments, and interest scores.

Enrichment exists to improve later product behavior:

- Reading views get cleaner summaries and metadata.
- Search gets better eligibility and ranking signals.
- Recommendations get interest and quality signals.
- Events and topics get enough information to organize related articles.
- Duplicate handling gets additional evidence beyond raw feed identity.

Enrichment should be bounded by feed and user configuration. If a feed disables a kind of analysis, crawl should still be able to save sensible baseline articles.

Enrichment failures should be handled at the smallest reasonable scope. One failed analysis should not invalidate unrelated entries or feeds.

## Tags

Tags produced during crawl can come from multiple concepts:

- Generated tags derived from article analysis.
- Feed-level tags that apply to all articles from a source.
- Rule-level tags added by user intent.

Tags represent user-facing organization and search metadata. The same conceptual tag should not be saved repeatedly with spelling or casing variations.

When the same tag is implied by multiple sources, the source that most directly represents user intent should be preserved as the strongest tag origin.

## Hotlinks and Cross-Article Signals

Crawl observes outbound links because links between articles are useful signals. If many feeds point to the same external article, that target may deserve attention inside the user's library.

Hotlink state is not the same as article identity. It is an attention signal derived from cross-article references. It should help identify articles that other sources are pointing toward, especially when those references come from different feeds.

Link normalization matters because tracking parameters and URL variants should not fragment the signal.

## Progress and Job Semantics

A crawl run may be long-lived and should be represented as observable work.

The progress model should support:

- Starting a crawl and receiving a stable job identity.
- Streaming progress events to current observers.
- Replaying recent progress to late observers.
- Reporting terminal success or failure.
- Cleaning up completed or abandoned job state.
- Preventing unbounded memory growth from large or stalled runs.

Progress events are a reporting contract. They should help the UI and operators understand what happened without requiring direct access to internal execution state.

## Results and Counters

Crawl results should distinguish between new articles, already-known or updated articles, skipped entries, and errors.

Counters are for operational understanding and user feedback. They should be honest about the work performed without implying that every non-new entry is a failure.

An empty crawl result can be successful. It may mean feeds had no new eligible content, all entries were already known, or configured freshness boundaries excluded older entries.

## Downstream Readiness

The article library should be coherent after crawl completes.

Newly saved articles should be ready for:

- Reading.
- Search and filtering.
- Tag browsing.
- Duplicate suppression.
- Event and topic grouping.
- Interest scoring and recommendations.

Some downstream work may run after the initial persistence phase. This is still part of the crawl architecture when it is triggered by crawl completion and scoped to users touched by the run.

## Failure Semantics

Crawl should isolate failures wherever possible.

A malformed entry should not break an entire feed. A problematic feed should not break unrelated feeds. A downstream enrichment failure should not erase successfully saved articles.

Hard failures are reserved for conditions that prevent the requested crawl from being meaningfully performed, such as missing ownership context, unavailable required persistence, or unrecoverable job-level errors.

Failures should be visible through logs, counters, and progress events so operators can understand whether ingestion was partial, skipped, or unsuccessful.

## Architectural Boundaries

Crawl decides how external feed entries become local article records and related ingestion metadata.

Crawl does not decide how articles are displayed, how users authenticate, how search ranks arbitrary historical articles, how recommendations are presented, or how feed discovery chooses new subscriptions.

Crawl may rely on feeds, articles, actions, tags, hotlinks, semantic processing, duplicate detection, and scoring, but those concepts remain external inputs or downstream collaborators. Crawl composes them into ingestion behavior; it does not own the entire lifecycle of each concept.

## Product Promise

The reader should experience crawl as a quiet, dependable refresh of their knowledge stream.

Feeds should update without duplicate clutter. Unsafe content should become safe to read. User rules should shape the inbox before it fills up. New articles should quickly become searchable, organized, and ready for recommendations.

The architecture succeeds when an agent can infer the correct crawl behavior from the user's intent and these principles, without needing to memorize the current implementation shape.
