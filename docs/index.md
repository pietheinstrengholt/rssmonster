---
layout: page
title: Home
nav_order: 1
---

# RSSMonster

RSSMonster is a self-hosted RSS reader for people who enjoy following their own
sources. Read chronologically, organize subscriptions, and save useful articles.
With optional AI processing, you can also explore related coverage, follow
ongoing stories, and rank articles by quality or personal interest.

![RSSMonster reading interface](assets/screenshot01.png)

## Start reading

- [Get Started →]({% link getting-started.md %}) — Installation and first steps.
- [Run the Desktop App →]({% link desktop.md %}) — Read locally with Electron and SQLite.
- [See It In Action →]({% link usability.md %}) — Reading modes and mobile layouts.
- [Deep Dive →]({% link how-rssmonster-works.md %}) — How it all works.

[Install RSSMonster]({% link getting-started.md %}), [create your account]({% link first-login.md %}),
and [add feeds]({% link feeds-and-categories.md %}) or [import an OPML file]({% link opml.md %}).
The default SQLite Docker deployment provides a lightweight reader. Use the
MySQL deployment with inference and its AI worker for background analysis and
semantic features; these are not enabled by default in the SQLite quick start.

Choose [Expanded, Reader, Summarized, Summary Bullets, or Headlines]({% link usability.md %})
to suit your reading session and screen. [Bookmarks]({% link bookmarks.md %}),
[keyboard shortcuts]({% link keyboard-shortcuts.md %}), and configurable
[read behavior]({% link marking-articles-read.md %}) help you work through your subscriptions.

## Find and organize

- **[Search]({% link search.md %}):** combine words with filters such as
  `title:javascript @today quality:>0.7`.
- **[Smart Folders]({% link smart-folders.md %}):** save a search as a reusable view.
- **[Tags]({% link tag.md %}):** organize articles using publisher, feed, generated, or rule-based labels.
- **[Actions]({% link actions.md %}):** automatically bookmark, mark read, tag, score, or hide incoming articles.
- **[Official Feeds]({% link official-feeds.md %}):** recognize articles from organization domains you configure.
- **[Feed item filters]({% link feed-item-filters.md %}):** decide which future entries a subscription accepts.
- **[HTML + XPath feeds]({% link html-xpath-feeds.md %}):** follow sites without a usable syndication feed.
- **[Generated feeds]({% link generated-feeds.md %}):** publish a saved selection at a revocable, token-protected RSS URL.

## Explore optional intelligent features

[Quality, Recommended, and Top Stories]({% link scoring.md %}) provide different ways to
order your reading. [FeedTrust]({% link feedtrust.md %}) explains how source
history contributes to those rankings. [Events]({% link events.md %}) collect coverage of a particular story;
[Topics]({% link topics.md %}) connect related themes; [Interest Islands]({% link interest-islands.md %})
use reading feedback to model recurring interests. Similar coverage is not
necessarily duplicate content, and a ranking score is not a fact check.

[Daily Briefing]({% link daily-briefing.md %}) offers a tunable recent collection and a
source-based story overview. The [assistant]({% link assistant.md %}) lets you ask questions
about stored articles in natural language. Ordinary search uses the documented
expression syntax; conversational requests belong in the assistant.

## Use RSSMonster beyond the browser tab

[Run RSSMonster as a desktop app]({% link desktop.md %}) with its own local SQLite
database and manual feed refresh, without Docker or a separate server.

[Install the web app and enable notifications]({% link web-app-and-notifications.md %}),
configure [account recovery and briefing emails]({% link account.md %}), or connect a
[Fever or Google Reader client]({% link api.md %}). Developers can use the
[native API]({% link rssmonster-api.md %}), authenticated RSS output, or MCP tools.

Self-hosting gives you control over storage and deployment. Optional external
inference providers receive the content needed for enabled model requests;
SMTP and browser Push delivery also use configured external services. Choose
[models and providers]({% link model-usage.md %}) to match your deployment preferences.

## Operate and understand your server

Start with [Configuration]({% link configuration.md %}) and [Administration]({% link administration.md %})
for crawling, processing jobs, email, maintenance, and backups. Read
[How RSSMonster Works]({% link how-rssmonster-works.md %}) for the processing architecture,
or [Concepts]({% link concepts.md %}) for the distinctions behind the interface.
The [FAQ]({% link faq.md %}) answers common questions about filtering and ranking.

For development setup, validation, and pull requests, read
[Contributing]({% link contributing.md %}).

RSSMonster is open source under the MIT license.
