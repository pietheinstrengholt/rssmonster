# RSSMonster

A modern, self-hosted RSS reader that turns information overload into organized, explainable reading.

[![Release](https://img.shields.io/github/v/release/pietheinstrengholt/rssmonster?style=flat)](https://github.com/pietheinstrengholt/rssmonster/releases) [![CI](https://github.com/pietheinstrengholt/rssmonster/actions/workflows/ci.yml/badge.svg)](https://github.com/pietheinstrengholt/rssmonster/actions/workflows/ci.yml) [![Docker pulls](https://img.shields.io/docker/pulls/rssmonster/rssmonster.svg?style=flat)](https://hub.docker.com/r/rssmonster/rssmonster) [![GitHub stars](https://img.shields.io/github/stars/pietheinstrengholt/rssmonster?style=flat)](https://github.com/pietheinstrengholt/rssmonster/stargazers) [![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen.svg?style=flat)](https://opensource.org/licenses/MIT)

[Documentation](https://pietheinstrengholt.github.io/rssmonster/) · [Quick start](#docker-quick-start) · [Features](#main-capabilities) · [Choose a deployment](#choose-a-deployment)

![RSSMonster Reader Mode: navigation, article list, and selected article in a three-panel workspace](docs/assets/screenshot01.png)

## Why RSSMonster?

RSSMonster treats your feeds as a stream of signals rather than a pile of unread
items. Keep the familiar feed inbox, then use intelligent organization to decide
what deserves attention and how different reports fit together.

- **Follow a story without rereading every headline.** Semantic Events collect
  reporting about the same occurrence and let you expand its coverage. Duplicate
  handling separately identifies repeated content, preserving the distinction
  between a syndicated copy and another publisher's reporting.
- **Understand why something ranks highly.** Recommended emphasizes your personal
  interests; Top Stories surfaces current coverage with broad source support.
  Inspect the contributing signals, or choose chronological reading when you
  simply want to catch up.
- **Define your own reading views.** Declarative Smart Folders turn advanced
  search expressions into reusable selections. A project watchlist, today's
  unread articles, and a quality-focused research inbox can each have their own
  rules without moving articles between collections.
- **Read comfortably throughout the day.** A three-panel desktop Reader, spacious
  Expanded view, compact summaries, keyboard navigation, and mobile gestures
  support both quick scans and longer reading sessions.
- **Choose how much infrastructure you need.** Start with SQLite for lightweight
  personal reading, or use MySQL and optional local inference for semantic
  organization and background analysis. You control storage and provider choices.

## See RSSMonster in action

The hero shows Reader Mode. These views show other ways to read and explore your
library, including features available with inference enabled. Click or tap a screenshot
to view it at full resolution. See [reading modes](docs/usability.md) for the
controls and layout differences.

### Scan or read in depth

<table>
  <tr>
    <td width="50%"><strong>Expanded Mode</strong><br><sub>Read article content and compare story sources.</sub></td>
    <td width="50%"><strong>Summarized Mode</strong><br><sub>Scan short previews in a compact stream.</sub></td>
  </tr>
  <tr>
    <td><a href="docs/assets/mode-expanded.png"><img src="docs/assets/mode-expanded.png" alt="RSSMonster Expanded Mode showing full articles in a reading stream"></a></td>
    <td><a href="docs/assets/mode-summarized.png"><img src="docs/assets/mode-summarized.png" alt="RSSMonster Summarized Mode showing compact article summaries"></a></td>
  </tr>
</table>

### Follow stories and interests

<table>
  <tr>
    <td width="50%"><strong>Events and Topics</strong><br><sub>Inspect story coverage and broader themes.</sub></td>
    <td width="50%"><strong>Interest Islands</strong><br><sub>Explore recurring interests shaped by reading feedback.</sub></td>
  </tr>
  <tr>
    <td><a href="docs/assets/events.png"><img src="docs/assets/events.png" alt="RSSMonster event and topic insights dashboard"></a></td>
    <td><a href="docs/assets/interestislands.png"><img src="docs/assets/interestislands.png" alt="RSSMonster interest islands insights dashboard"></a></td>
  </tr>
</table>

### Read across devices

<table>
  <tr>
    <td width="67%"><strong>Landscape</strong><br><sub>Keep navigation visible on wider screens.</sub></td>
    <td width="33%"><strong>Portrait</strong><br><sub>Read a focused stream with compact touch controls.</sub></td>
  </tr>
  <tr>
    <td><a href="docs/assets/mode-mobile-landscape.png"><img src="docs/assets/mode-mobile-landscape.png" alt="RSSMonster responsive landscape layout in dark mode"></a></td>
    <td><a href="docs/assets/mode-mobile-portrait.png"><img src="docs/assets/mode-mobile-portrait.png" alt="RSSMonster responsive portrait layout in dark mode"></a></td>
  </tr>
</table>

## Main capabilities

### Reading

Use **Reader**, **Expanded**, or **Summarized** mode; **Headlines** offers a denser
list, while **Summary Bullets** displays generated summaries when analysis is
available. Bookmark articles, open original sources, and control when articles
are marked read. [Keyboard shortcuts](docs/keyboard-shortcuts.md), portrait
bookmark swipes, and light, dark, or system themes support everyday reading.

### Organization

Arrange subscriptions into categories, label articles with tags, and keep
favorites for later. [Feed item filters](docs/feed-item-filters.md) accept or
exclude future entries per subscription. [Automated actions](docs/actions.md)
apply regular-expression rules to bookmark, mark read, tag, hide, or override
scores on matching incoming articles.

[Search](docs/search.md) combines words, dates, article state, tags, and supported
score or semantic filters. Save a query such as `@today unread:true sort:desc`
as a [Smart Folder](docs/smart-folders.md); new matches appear automatically.
Inference-backed score and semantic selections need the corresponding processing
to be enabled and available.

### Intelligence

[Events](docs/events.md) connect reports about an occurrence;
[Topics](docs/topics.md) connect broader themes; [Interest Islands](docs/interest-islands.md)
learn recurring personal interests from reading feedback. Related-article
recommendations use semantic evidence, while expandable story sources keep
alternative coverage accessible. Sparse evidence can legitimately produce no
recommendations.

[Scoring and Ranking](docs/scoring.md) documents Recommended, Top Stories, and
Quality ordering. Article quality describes writing, tone, and promotional
content; [FeedTrust](docs/feedtrust.md) describes a subscribed source's recent
value. These remain separate signals, and neither is factual verification.

The optional [assistant](docs/assistant.md) supports conversational discovery and
source-based answers about stored articles. It uses an OpenAI provider and is
configured separately from local embeddings, summaries, tags, and scoring.

### Self-hosting and compatibility

Run with SQLite or MySQL and keep accounts, subscriptions, and reading state
scoped to each user. Move subscriptions with [OPML import/export](docs/opml.md),
or expose saved selections as private, tokenized [generated RSS feeds](docs/generated-feeds.md).
[Fever](docs/fever-api.md) and [Google Reader](docs/google-reader-api.md) compatibility
connect supported client workflows; consult their documented contracts and
limitations when choosing a client.

## Choose a deployment

Run RSSMonster as a desktop app or host a server for access across devices.
The screenshots showcase capabilities from the broader product; desktop mode
and the SQLite quick start run without inference models.

| Deployment | Best for | Included capabilities |
| --- | --- | --- |
| **[Desktop app (Electron)](docs/desktop.md)** | Reading locally on Windows, macOS, or Linux | Existing reader with a local SQLite database and manual feed refresh. No Docker, separate server setup, worker processes, scheduled crawling, or inference/AI. |
| **SQLite quick start** | Trying RSSMonster and lightweight personal reading | Web reader, scheduled crawling, search, subscriptions, and rule-based organization. No separate database service, inference service, or AI worker. |
| **Comprehensive MySQL deployment** | Local intelligent processing, multiple active users, and higher write concurrency | MySQL 8.4, crawl and AI workers, Qwen embeddings and generation, and ModernBERT scoring for analysis, semantic organization, and recommendations. |

Install the [Progressive Web App](docs/web-app-and-notifications.md) on supported
devices to use an existing self-hosted RSSMonster server in its own app window,
with optional Web Push for new articles. The PWA caches its shell; loading
articles and saving reading state still require access to that server. The
Electron desktop app runs its own backend and stores its data locally.

Saved search-based Smart Folders work in desktop mode and both server profiles.
Choose the comprehensive profile for local classification, embeddings, scoring, semantic labels, Smart
Folder recommendations, and feed rediscovery **without an OpenAI API key**.
These inference-backed features are disabled in desktop mode and the SQLite quick
start; the optional OpenAI assistant requires separate configuration. For model downloads,
credentials, startup, and readiness checks, follow the
[MySQL deployment guide](docs/getting-started.md#comprehensive-mysql-deployment).

For self-hosting, database choice and inference settings are separate configuration
concerns; SQLite and MySQL are the two supplied server profiles.
Read [database configuration](docs/configuration.md#database)
and [model usage](docs/model-usage.md) before customizing a source installation.

## Docker Quick Start

Have Git, Docker Engine or Docker Desktop, and Docker Compose available. The
commands below use a POSIX shell and start the default SQLite profile.

**1. Clone the repository.**

```bash
git clone https://github.com/pietheinstrengholt/rssmonster.git
cd rssmonster
```

**2. Create application secrets.** Create an owner-only `.env` in the repository
root:

```bash
touch .env
chmod 600 .env
openssl rand -hex 32
```

Run the OpenSSL command twice, then add the two different generated values to
`.env` in place of these placeholders:

```env
JWT_SECRET=replace-with-a-long-random-secret
FEVER_CREDENTIAL_SECRET=replace-with-a-different-long-random-secret
```

Keep these values private and stable across restarts; never commit the file.
On systems without POSIX permissions, restrict access using the host's file
access controls.

**3. Start RSSMonster and create your account.**

```bash
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000). Startup initializes the
SQLite database and starts the web application and dedicated crawl worker.
Create your first account, then add feeds or import an OPML subscription list.
The first account becomes the administrator; see [First Login](docs/first-login.md).

Persistent data lives in the `rssmonster-data` Docker volume, mounted at
`/app/data`. `docker compose down` stops the deployment while keeping data.
**Do not use `docker compose down -v` unless you intend to delete the database
volume.**

The application port binds to host loopback by default. Before exposing it to
other machines, follow [configuration and reverse-proxy guidance](docs/configuration.md#proxy-and-network-security)
and configure HTTPS. See [Getting Started](docs/getting-started.md) for complete
installation instructions, health checks, logs, and production setup.

## Documentation

Use the [documentation index](docs/index.md) to explore the complete guides.

| Topic | Guides |
| --- | --- |
| Installation and deployment | [Getting Started](docs/getting-started.md), [manual installation](docs/getting-started.md#manual-installation), [macOS](docs/osx-installation.md), [Ubuntu](docs/ubuntu-installation.md), [production deployment](docs/getting-started.md#production-deployment) |
| Configuration and storage | [Environment settings and reverse proxies](docs/configuration.md), [SQLite and MySQL](docs/configuration.md#database), [Backup and Restore](docs/backup-restore.md) |
| Local inference and models | [Inference administration](docs/inference.md), [Model Usage](docs/model-usage.md), [Assistant and MCP](docs/assistant.md) |
| Finding and organizing articles | [Search](docs/search.md), [Smart Folders](docs/smart-folders.md), [feed item filters](docs/feed-item-filters.md), [Actions](docs/actions.md) |
| Semantic architecture and rankings | [How RSSMonster Works](docs/how-rssmonster-works.md), [implementation guide](docs/semantic-services-implementation.md), [Scoring](docs/scoring.md), [FeedTrust](docs/feedtrust.md) |
| Notifications and integrations | [Web Push](docs/web-app-and-notifications.md), [Fever API](docs/fever-api.md), [Google Reader API](docs/google-reader-api.md) |
| Development and maintenance | [Contributing](docs/contributing.md), [npm Commands](docs/npm-commands.md), [Server Jobs](docs/server-jobs.md) |

## Contributing

Bug reports, documentation improvements, tests, and focused feature contributions
are welcome. Read [Contributing](docs/contributing.md) for development setup, validation,
and pull requests. Describe reproducible issues and include your deployment
profile so others can investigate the same behavior.

## Credits and license

Created by Piethein Strengholt and contributors. Built with Node.js, Express,
Vue 3, Sequelize, SQLite/MySQL, Bootstrap Icons, and
[feedsmith](https://github.com/macieklamberski/feedsmith).

Copyright © 2026 Piethein Strengholt. Released under the [MIT License](LICENSE.md).
