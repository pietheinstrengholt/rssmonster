# RSSMonster v2.3.0

RSSMonster 2.3.0 is a major update focused on desktop availability, local AI,
more flexible feed acquisition, better discovery, and stronger operational
reliability.

## Highlights

### RSSMonster Desktop

RSSMonster is now available as a standalone Electron desktop application for
Windows, macOS, and Linux. The desktop edition bundles the Vue client, Express
server, and SQLite database into one installable application, keeps application
data in the operating system's user-data directory, and shuts down its local
HTTP server and database cleanly when the final window closes.

The release pipeline produces:

- a Windows x64 installer;
- macOS disk images for Intel and Apple Silicon;
- a Linux x86-64 AppImage; and
- a Debian amd64 package.

The first desktop release is intentionally lightweight: feeds are refreshed
manually, and scheduled crawling, background workers, Web Push, email delivery,
and inference-backed AI features are not included. The installers are currently
unsigned, so operating systems may display a trust warning during installation.

### Local and OpenAI-compatible inference

- Added a standalone inference service for all model-provider calls.
- Added local Qwen3 embeddings, Qwen3.5 generation, and ModernBERT article
  scoring, with persistent model caching.
- Added support for OpenAI-compatible gateways through a configurable base URL,
  optional temperature omission, and configurable assistant reasoning effort.
- Added readiness checks, bounded queues, overload responses, request
  cancellation, timeouts, and capability-specific circuit breakers.
- Kept OpenAI available as an alternative provider and for the optional
  assistant.

### Durable background AI processing

- Added a dedicated AI worker backed by persisted processing jobs.
- Added leases, bounded retries, restart recovery, dead-letter handling, job
  history cleanup, and recovery for stranded article-analysis work.
- Added processing-job and failure observability in Settings.
- Added database deadlock retries and improved inference failure reporting.

### More ways to follow and share content

- Added HTML + XPath feeds for following server-rendered websites that do not
  publish RSS. XPath rules can extract item titles, URLs, content, authors,
  dates, thumbnails, and stable identifiers, with a safe preview before saving.
- Added per-feed regular-expression filters for title, content, URL, author, and
  category. Rejected entries stop before article persistence and AI processing.
- Added persisted Generated Feeds that expose Search or Smart Folder expressions
  as private, token-protected RSS feeds.
- Added an asynchronous OPML import preview with duplicate detection,
  reachability checks, feed selection, and category editing.

### Search, Smart Folders, and discovery

- Added MySQL FULLTEXT article search and highlighted search matches.
- Added a search dropdown with syntax guidance and recent searches.
- Made Smart Folder expressions explicitly own their sorting and grouping.
- Added per-folder mark-as-read-while-scrolling behavior for unread folders.
- Improved new-article checks so refresh prompts only count unread arrivals that
  match the current selection and result window.
- Refined personalized Recommended ranking and non-personalized Top Stories.
- Improved FeedTrust calculation, article-quality explanations, related-story
  popovers, progressive tag disclosure, and behavioral-topic signals.
- Removed the obsolete Trust and Attention sort expressions.

### Email, account recovery, and notifications

- Added optional SMTP email delivery, email-address verification, and secure
  password recovery.
- Added scheduled daily briefing emails with configurable time, timezone, and
  empty-briefing behavior.
- Added optional Web Push notifications for newly crawled articles.
- Added hard delivery deadlines for stalled push endpoints.
- Administrator password changes now revoke existing sessions.

### Reader and integration improvements

- Refined the Reader layout, sidebar, category navigation, settings, dark mode,
  mobile controls, and responsive presentation.
- Improved PWA unread badges, chat behavior, pull-to-refresh, and iOS/WebKit
  scroll positioning.
- Improved article-loading and pagination error handling.
- Improved feed favicon resolution and retention of crawl refresh state.
- Fixed Fever HTML fallback and bulk mark-as-read behavior.
- Fixed Google Reader folder and feed-stream compatibility.
- Made action-rule replacement transactional and added consistent validation for
  plain and slash-delimited regular expressions.

### Deployment, security, and maintenance

- Hardened Docker networking, proxy, secret-file, and worker-health defaults.
- Added separate feed connection and response-body timeouts.
- Increased crawl throughput and improved SQLite reconciliation concurrency.
- Expanded CI across the client, server on MySQL and SQLite, inference service,
  Compose configurations, and desktop packaging.
- Updated dependencies and addressed security findings, including regex
  hardening and CVE fixes.
- Expanded product, administration, inference, feed, API, and comparison
  documentation.

## Desktop documentation

See [`desktop/README.md`](desktop/README.md) for supported platforms, desktop
behavior, local builds, verification, data locations, and current limitations.

## Upgrade notes

- Back up the RSSMonster database before upgrading.
- Existing self-hosted installations remain supported; the Electron application
  is an additional distribution and does not replace the server deployment.
- Allow the normal application startup to apply the new database migrations.
- The inference service is now the boundary for model-provider calls. Review the
  inference configuration when upgrading an installation that previously called
  OpenAI directly.
- Review saved searches that still use the removed `sort:trust` or
  `sort:attention` expressions.
