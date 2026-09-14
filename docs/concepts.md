---
layout: page
title: Concepts
parent: How RSSMonster Works
nav_order: 8
---

# Concepts

RSSMonster combines a conventional feed reader with optional analysis and
recommendation features. Understanding the following distinctions helps explain
why an article appears, how it is grouped, and what changes when you read it.

## Articles and revisions

An article is an entry collected from a syndication feed or an HTML + XPath
source. Stable publisher identity is checked before duplicate-content matching.
When a publisher updates an existing entry, RSSMonster can revise the stored
article while preserving read state, bookmarks, clicks, and manual tags.
A metadata correction or extraction repair is not necessarily a new revision.

RSSMonster stores source and presentation data separately. Raw source content
(`contentOriginal`), sanitized presentation HTML (`contentHtml`), canonical plain
text (`contentText`), and description fields have distinct purposes. Historical
`contentStripped` data is not interchangeable with all of these representations.
API JSON omits raw `contentOriginal`; use the returned normalized content fields.

## Duplicates, events, and interests

| Concept | What it represents | Example |
| --- | --- | --- |
| Duplicate | Another record representing the same content, based on deterministic identity/content evidence | A syndicated copy |
| [Event]({% link events.md %}) | Coverage of a particular occurrence | Several reports about one product announcement |
| | A broader semantic theme connecting events or behavior | Developments in battery technology |
| [Interest Island]({% link interest-islands.md %}) | A recurring personal interest inferred from engagement | The user's sustained interest in electric transport |

Articles about the same event can provide different reporting and remain distinct.
Semantic similarity alone is not duplicate evidence. Likewise, an event and a
personal interest are not interchangeable “clusters.” Event grouping can show a
representative article and continuing developments while keeping coverage
available through story-source controls.

Read-state behavior depends on the selected view and grouping. See
[Marking Articles Read]({% link marking-articles-read.md %}) and
[grouped-event reading]({% link events.md %}#marking-a-grouped-event-read); reading one
article does not universally mark every related article read.

## Quality, originality, and trust

Article quality combines stored quality, sentiment, and advertising scores into
a normalized `0`–`1` value. Higher advertising scores mean less promotional
content. AI analysis supplies estimates when enabled; otherwise default values
can be used. These are ranking signals, not verification of facts.

Originality evidence in FeedTrust comes from actual duplicate links. It does not
measure how much novel reporting every article adds to its semantic event.
[FeedTrust]({% link feedtrust.md %}) combines recent article quality, exposure-backed
engagement, deterministic originality, and explicit negative feedback. Sparse
evidence is pulled toward a neutral value of `0.75`.

FeedTrust is user-specific source history. It is separate from crawl health and
personal affinity. A reliable HTTP endpoint is not necessarily a valuable
source, and a low personal interest match is not necessarily a low-quality article.

## Ranking and filtering

[Ranking]({% link scoring.md %}) orders an eligible collection. Newest and Oldest order by
date; Quality combines article quality with FeedTrust; Recommended incorporates
personal relevance; Top Stories emphasizes recent event coverage.

Filtering decides which articles qualify. Score thresholds, the selected status,
feed/category scope, and search expressions can exclude articles before you see
the ranking. Grouping can further reduce visible rows without deleting coverage.
Chronological ordering alone therefore does not remove every active filter.

## Reading feedback

Read state, exposure, clicks, bookmarks, and explicit **More like this** or
**Not interested** feedback provide different signals. Interest Islands use
behavioral evidence for personal relevance; FeedTrust uses its own bounded
engagement model. Fresh installations may have little useful personal evidence,
and zero related recommendations is a valid outcome.

## Organization and automation

Categories organize subscriptions. Tags label articles. [Smart Folders]({% link smart-folders.md %})
store queries, while [generated feeds]({% link generated-feeds.md %}) expose query results
as RSS. These features complement one another.

[Actions]({% link actions.md %}) match article fields with regular expressions during crawling.
They can tag, bookmark, change state, override scores, or store filtered articles.
Discarding through an Action is not deletion. [Feed item filters]({% link feed-item-filters.md %})
control acceptance of future entries from a particular feed; search filters
operate on stored articles.

## Processing and availability

Crawling extracts and normalizes entries, resolves identity and revisions, applies
duplicate/filter rules, and persists results. Optional processing adds analysis,
vectors, and semantic organization. Work is split across web, crawl-worker, and
AI-worker processes; see [How RSSMonster Works]({% link how-rssmonster-works.md %}).

The default SQLite deployment is a lightweight reader. The MySQL deployment
supports the background AI workflow. Per-feed switches cannot override disabled
server capabilities. Model choice and provider availability affect semantic
results, so inspect the [configuration]({% link configuration.md %}) before interpreting
missing summaries or recommendations as missing articles.
