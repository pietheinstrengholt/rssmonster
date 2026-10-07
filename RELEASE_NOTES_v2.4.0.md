# RSSMonster v2.4.0

RSSMonster 2.4.0 introduces OpenID Connect, administrator-managed server
settings, behavior-driven personalization, offline reading, and operational
webhooks. It also expands Desktop with local AI and a portable Windows edition,
adds Smart Folders and manual tagging, and gives readers more control over their
subscriptions and article retention.

## Highlights

### OpenID Connect and account policies

- Added provider-neutral OpenID Connect authentication using Authorization Code
  with PKCE and standard OIDC discovery.
- Existing local accounts can link an identity-provider account without losing
  feeds, reading state, or roles.
- Added optional automatic user provisioning and controls for local
  authentication, account linking, allowed email domains, groups, and claims.
- Administrators can close public registration independently of OIDC provisioning.

### Administrator-managed server settings

- Added **Settings → Server settings** for deployment-wide configuration of
  registration, SMTP, OIDC, Web Push, crawl scheduling, HTTP limits, and parser
  resources.
- Saved settings override environment defaults, with sensitive values masked
  and encrypted at rest. Runtime-aware services apply changes without a full
  application restart where supported.

### Inference configuration and compatible providers

- Administrators can configure and test remote inference endpoints and inspect
  provider capabilities from **Settings → AI / Inference**.
- Added separate OpenAI-compatible generation and assistant connections,
  supporting local services such as Ollama.
- Added runtime controls for AI availability, article analysis, embeddings,
  and semantic labeling, plus a standalone inference Docker image.

### Desktop local AI and Windows portable edition

- Desktop now manages a bundled local inference service and AI worker for
  ModernBERT classification, Qwen3 embeddings, and Qwen3.5 generation. Models
  download on first launch and are reused on later starts.
- The reader opens while models initialize. Desktop feed refresh remains manual,
  and the Assistant remains disabled by default.
- Added a portable Windows executable alongside the existing installer. It needs
  no installation and stores SQLite, secrets, models, and application state in a
  `data/` directory beside the executable.
- The portable folder can be moved or backed up as a complete unit. Upgrades
  replace the executable while preserving `data/`.

### Behavior-driven personalization

- Replaced the Topic layer with Interest Islands that learn directly from
  explicit feedback, favorites, outbound clicks, and sustained reading.
- Islands use positive and negative evidence, confidence-aware scoring, and
  time-based decay, with scheduled refreshes, archival, and reactivation.
- Added **Settings → Islands** to inspect interests, supporting evidence, and
  example articles. Islands can be muted without losing their evidence.
- Recommended ordering gives personal interest a larger contribution while
  retaining quality, freshness, corroboration, and other supporting signals.
- Added feed-level personal-interest affinity and sidebar sorting by interests.

### Event identity and category controls

- Strengthened Event matching to distinguish reports about separate real-world
  occurrences, using temporal, headline, entity, and source evidence.
- Added per-category clustering modes: **Server default**, **Aggressive**,
  **Moderate**, and **Conservative**. Changes apply to future Event assignments.

### Operational webhooks

- Added user-owned webhooks with conditions for feed, category, title, author,
  URL, domain, article text, and language.
- Newly accepted articles queue durable JSON deliveries through a dedicated
  worker with bounded retries and optional HMAC-SHA256 signatures.
- Stable delivery identifiers let receivers handle retries safely. Existing
  articles and later revisions do not trigger another delivery.

### Read-only offline reading

- Added **Settings → Offline reading** to download up to 5,000 articles for
  reading when the server is unreachable.
- Downloads are isolated by device, account, and server, and include article
  text, metadata, tags, and captured read/saved state.
- Offline reading is read-only and requires online preparation; changes are
  not queued for later synchronization.

### Smart Folders and manual article tagging

- Added **Save as smart folder** to turn an active search into a reusable dynamic
  collection, including supported filters, sorting, grouping, and date presets.
- Added **Add tags** and **Manage tags** for manual article tagging, with inline
  tag creation and multi-tag selection.
- Manual tags work across article views, search, Smart Folders, and sidebar
  navigation.

### Reading controls

- Added browser text-to-speech with pause/resume controls for Reader articles.
- Added persistent text-size choices and an expand/restore mode for the selected
  article.
- Added rolling unread-age filters and calendar filters, including custom date
  ranges, plus controls to load newly arrived articles or refresh the unread list.
- Extended bulk article actions across Expanded, Summarized, Summary Bullets,
  and Headlines views.

### Automation and quality filtering

- Automation Actions now support simple phrase matching as well as advanced
  regular expressions, with a preview against recent eligible articles.
- Added Action reordering to control rule execution order.
- Added an independent **Overall quality** threshold alongside the existing
  writing, tone, and ad-free controls.

### Hot articles and Daily Briefing

- Hot articles receive a bounded boost in Recommended and Top Stories based on
  links from other feeds in the user's subscriptions.
- Added **Include Hot articles** to Daily Briefing preferences, enabled by
  default and subject to the existing briefing filters.

### Configurable sidebar and shortcuts

- Added persistent sidebar settings for counts, favicons, section order, and
  sorting, including personal-interest affinity and recent feed activity.
- Feeds and categories can be pinned into a reorderable shortcuts section.
- Added optional grouping of inactive feeds after 30, 60, or 90 days.

### Article retention and cleanup

- Added per-user retention by age, per-feed count, or total count, with separate
  protection for unread, favorited, and clicked articles.
- Added **Cleanup now** and nightly cleanup through the crawl worker. Desktop
  supports manual cleanup only.
- Added per-feed ongoing admission windows to prevent older unseen entries from
  being reimported after cleanup, while preserving revisions and initial imports.

### Feed support and deployment options

- Added HTTP Basic authentication for protected RSS and Atom feeds, with
  encrypted passwords and credential stripping on cross-origin redirects.
- Added outbound feed-proxy support through `HTTP_PROXY`, `HTTPS_PROXY`, and
  `NO_PROXY` for discovery, validation, crawling, and related feed requests.
- Added structured author lists with profile links and publisher-declared
  original-source attribution.
- Added explicit MariaDB 11.4 support through `DB_DIALECT=mariadb`.

## Upgrade notes

- Back up the database before upgrading and allow the normal RSSMonster startup
  process to apply all pending migrations, including the new webhook tables.
- Manual deployments using webhooks must run `npm run start:webhook-worker` from
  `server/` alongside the web and crawl processes. Use the same `ENCRYPTION_KEY`
  for the web and delivery worker when configuring signing secrets.
- Outbound proxy deployments must configure both the web service and crawl
  worker and restart both after changing proxy URLs. Use a trusted proxy that
  blocks prohibited destinations after DNS resolution; direct internal feeds
  still require the explicit internal-host allowlist.
- Offline article downloads require an online preparation step on each device;
  installing the PWA alone does not download articles. Offline reading does not
  synchronize edits or replace a database backup.
- Topics have been removed. Personalization now uses behavior-driven Interest
  Islands directly.
- The personal settings table is migrated from `settings` to `user_settings`.
- Review article-retention settings after upgrading. The default age limit is
  seven years, and nightly cleanup requires the crawl worker.
- Established feeds receive a default 30-day ongoing admission window. Review
  **Update feed** if a subscription needs a longer window for unseen entries.
- Saved sensitive server settings and authenticated feed passwords require a
  stable encryption key. Back up that key together with the database.
- Inference no longer assumes an implicit localhost endpoint. Configure a
  deployment endpoint through the environment or **Settings → AI / Inference**.
- Desktop is the exception to that deployment rule: it configures and manages its
  bundled local inference service automatically. First launch needs network access,
  several gigabytes of disk space, and enough memory for the three CPU models.
- Windows portable users should close RSSMonster before copying its folder or
  replacing the executable. Preserve the complete `data/` directory, including
  `secrets.json`, and use a writable location. Installed users retain their
  existing `%APPDATA%\RSSMonster` profile; the two modes are separate.
- MariaDB installations must explicitly set `DB_DIALECT=mariadb`; the bundled
  comprehensive Compose profile continues to use MySQL.
- Existing semantic vectors carry model metadata after migration. Vectors from
  incompatible models are deliberately excluded from comparisons.
- Category Event-clustering changes affect future assignments only; they do not
  regroup existing Events automatically.

## Documentation

- [OIDC configuration](docs/oidc-configuration.md)
- [Server settings](docs/server-settings.md)
- [Inference administration](docs/inference.md)
- [Ollama setup](docs/ollama.md)
- [Desktop application](docs/desktop.md)
- [Scoring and Overall quality](docs/scoring.md)
- [Interest Islands](docs/interest-islands.md)
- [Hot articles](docs/hot-articles.md)
- [Daily Briefing](docs/daily-briefing.md)
- [Categories and Event clustering](docs/categories.md)
- [Sidebar settings](docs/sidebar-settings.md)
- [Article archiving](docs/archiving.md)
- [Feeds and HTTP Basic authentication](docs/feeds-and-categories.md)
- [Outbound feed-proxy configuration](server/services/feeds/README.md#outbound-feed-proxies)
- [Reading views and controls](docs/usability.md)
- [Desktop and server backups](docs/backup-restore.md)
- [Smart Folders](docs/smart-folders.md)
- [Tags and manual article tagging](docs/tag.md)
- [Offline PWA reading and notifications](docs/web-app-and-notifications.md)
- [Webhooks and delivery worker](docs/webhooks.md)
