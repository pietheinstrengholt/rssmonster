---
layout: page
title: Feeds and Categories
parent: Using RSSMonster
nav_order: 10
---

# Feeds and Categories

Feeds are your subscriptions; categories organize those subscriptions. Start
with **Add new feed** in the sidebar or mobile Options sheet. Supply a feed or
website URL and review the discovered subscription before adding it. For a larger
collection, [import OPML]({% link opml.md %}). For sites without a usable RSS or Atom feed,
use an [HTML + XPath feed]({% link html-xpath-feeds.md %}).

## Organize subscriptions

Use the desktop sidebar to select individual feeds, create or rename categories,
choose category icons, and reorder feeds or categories. Moving a feed to another
category changes organization; it does not create a second subscription.
On phones, the toolbar and Options sheet expose categories, while individual feed
navigation is available in the persistent sidebar on wider layouts.

Categories contain feeds. [Tags]({% link tag.md %}) label articles, and
[Smart Folders]({% link smart-folders.md %}) select articles by a saved search. Use whichever
matches the kind of organization you need.

## Sidebar counts

Open the sliders button beside **Categories** to configure its category, feed,
and **All categories** counts. **Show total count** displays selection/total
(for example, `9/109`); turn it off to show only the selected count.
**Declutter counts** hides redundant totals, displaying `0` instead of `0/0`
and `4` instead of `4/4`, while keeping informative values such as `0/4`.
Both options default to enabled. Choose **Save changes** to apply them and
remember them for your account; **Cancel** discards edits.

## Edit feed processing

The feed editor includes a display name, description, category, active/disabled
status, and these processing controls:

| Control | Meaning |
| --- | --- |
| Update interval | Base crawl cadence; publisher caching and retry deadlines can delay the next fetch. |
| Generate embeddings | Generate article vectors when server inference settings permit it. |
| Apply AI analysis | Request summaries, generated tags, sentiment, quality, and advertisement analysis when enabled on the server. |
| Feed tags | Labels separated by spaces or commas. |
| Item filter | Accept only future entries matching the [filter expression]({% link feed-item-filters.md %}). |

Per-feed AI switches do not override the server's master disable flags. Changing
a processing option does not automatically rebuild historical article analysis.
See [Article Embedding]({% link article-embedding.md %}) and [Server Jobs]({% link server-jobs.md %})
before considering historical processing.

Muting controls visibility. Disabling a feed stops its normal scheduled crawling.
Deleting a feed is a destructive subscription action; review the confirmation
before proceeding and use [backups]({% link backup-restore.md %}) for recovery.

## Refresh and diagnose

**Refresh feeds** requests publisher fetching and displays crawl progress.
Refreshing an article collection, including mobile pull-to-refresh, reloads stored
results and is a different operation.

In **Settings → Feeds**, inspect a feed's health, recent crawl history, article
counts, warnings, and request attempts. Retry a failing feed after checking its
reported error. For feeds in error, the editor can offer AI-assisted RSS
rediscovery when AI is enabled; review the suggested URL and save the change.
Rediscovery can return no result.

For stale subscriptions, check that the feed is active, the crawl worker is
running, and cache or retry deadlines have elapsed. See [Crawling]({% link crawling.md %})
for scheduling, network restrictions, and worker diagnostics.

## Identify official sources

**Settings → Official Sources** lets you add an organization, its domain, and an
enabled flag. During crawling, matching articles are marked official and stored
with the organization name. See [Official Feeds]({% link official-feeds.md %}) for
setup instructions and domain-matching examples. This is a configured source designation, not a
verification of an article's factual accuracy or a replacement for
[FeedTrust]({% link feedtrust.md %}).
