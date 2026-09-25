# RSSMonster v2.4.0

RSSMonster 2.4.0 is a substantial update focused on identity and server
administration, behavior-driven personalization, reader controls, feed metadata,
content retention, and deployment flexibility.

## Highlights

### OpenID Connect and account policies

- Added provider-neutral OpenID Connect authentication using Authorization Code
  with PKCE and standard OIDC discovery.
- Existing local accounts can link an identity-provider account without losing
  feeds, reading state, or roles.
- Added optional automatic provisioning for new OIDC users. Provisioned accounts
  are ordinary users and are never automatically promoted to administrator.
- Added provider-managed verified email synchronization and controls for local
  authentication, account linking, allowed email domains, groups, and claims.
- Added separate controls for public local registration. Administrators can close
  registration without affecting existing accounts or OIDC provisioning.
- Improved development-login handling so bypass requests are not made when the
  bypass is disabled.

### Administrator-managed server settings

- Added **Settings → Server settings** for deployment-wide configuration.
- Administrators can manage public registration, SMTP, OIDC, Web Push, crawl
  scheduling, HTTP limits, and parser resources from the application.
- Saved database overrides take precedence over environment defaults and can be
  restored independently for each configuration group.
- SMTP and OIDC credentials, VAPID keys, and other sensitive saved values remain
  masked and encrypted at rest.
- Runtime-aware services and workers pick up saved settings without requiring a
  full application restart where supported.
- Renamed the internal `settings` table to `user_settings` to distinguish personal
  preferences from deployment-wide settings.

### Inference configuration and compatible providers

- Administrators can configure and test a remote inference endpoint and optional
  API key from **Settings → AI / Inference**.
- Added capability discovery showing safe provider, model, availability, and
  embedding-dimension information for embeddings, generation, classification,
  and the assistant.
- Added runtime controls for inference and assistant availability, timeouts,
  circuit breakers, article analysis, embeddings, and semantic labeling.
- Added separate OpenAI-compatible generation and assistant connections, making
  local services such as Ollama easier to configure.
- Added non-blocking startup handshakes that verify compatible endpoints and model
  availability during development.
- Added optional reasoning controls and structured completion diagnostics.
- Fixed floating-point embedding responses from compatible backends and added
  embedding-model metadata so incompatible vector spaces are rejected instead of
  compared.
- Added publication of the standalone inference Docker image.

### Behavior-driven personalization

- Removed the Topic layer and made Interest Islands the primary long-term
  personalization model.
- Interest Islands now learn directly from explicit feedback, favorites, outbound
  clicks, and deep reading behavior.
- Added per-signal decay, signed positive and negative evidence, confidence-aware
  scoring, active capacity, archival, and evidence-based reactivation.
- Added reading-attention tracking across article views so sustained reading can
  contribute to personalization without overriding explicit feedback.
- Added scheduled personalization refreshes so old evidence can decay even when
  no new interaction occurs.
- Improved Island labeling, evidence selection, diagnostics, and recommendation
  evaluation commands.
- Increased the contribution of personal interest to Recommended ordering while
  preserving article quality, freshness, corroboration, and other supporting
  signals.
- Reused personalization evidence within article requests and bounded expensive
  Island operations to reduce repeated work and memory pressure.

### Stronger Event identity and category controls

- Enforced shared occurrence identity so semantically similar reports about
  different real-world occurrences are less likely to be merged.
- Expanded Event matching evidence and diagnostics, including temporal,
  headline, entity, ambiguity, and source support.
- Extended the hard Event matching window while retaining recency and
  occurrence-identity safeguards.
- Added per-category Event clustering behavior: **Server default**,
  **Aggressive**, **Moderate**, or **Conservative**.
- Category clustering affects future attachment to existing Events without
  rebuilding previous assignments or changing Interest Island scoring.
- Event clustering controls are shown only when AI features are available.

### New unread-reading controls

- Added a dismissible new-articles banner that tracks arrivals relative to the
  current unread-list baseline.
- Readers can load only the newly arrived articles or refresh the complete unread
  list without losing the current collection unexpectedly.
- Added unread age filters for all articles, the last 24 hours, three days, or
  seven days.
- Added calendar filters for Today, Yesterday, This week, This month, and custom
  date ranges.
- Added a sticky date context that follows the visible article while preserving
  the selected sort order.
- Improved unread-filter reset, custom-date dismissal, count refresh, and mobile
  tuning controls.
- Refresh checks now distinguish newly stored unread articles from changes that
  do not belong in the active result window.

### Reader and presentation improvements

- Enabled scroll-to-read behavior for desktop Headlines and refined headline
  read-state controls.
- Added lead images to summarized articles on desktop and mobile.
- Added a preference to keep RSSMonster open when following article-body links by
  opening them in a new tab.
- Preserved article view mode across reloads.
- Kept local theme changes active during backend outages and retry preference
  persistence in the background.
- Improved article-loading errors, toolbar alignment, arrivals presentation, and
  compact mobile controls.

### Configurable sidebar and shortcuts

- Added persisted sidebar configuration for count display, count decluttering,
  zero-count visibility, favicons, and section order.
- Added sorting by manual order, name, selected count, total count, or recent feed
  activity.
- Added optional grouping of inactive feeds after 30, 60, or 90 days.
- Feeds and categories can now be pinned into a dedicated, reorderable shortcuts
  section.
- Added dependency-aware controls and explanations when count options are not
  applicable.

### Article cleanup and nightly archiving

- Added per-user retention settings and an immediate **Cleanup now** action.
- Articles can be retained by age, per-feed count, or total count.
- Unread, favorited, and clicked articles can be protected independently from
  deletion.
- Added nightly cleanup at 03:00 through the crawl worker, with failures isolated
  per user.
- The default maximum article age is seven years; count limits remain unlimited
  unless configured.
- Desktop installations retain the manual cleanup action but do not run the
  nightly worker.

### Richer feed and article metadata

- Upgraded FeedSmith to 3.0 and adapted RSS, Atom, RDF, and JSON Feed
  normalization.
- Added stronger feed-entry identity and publication-date fallbacks.
- Added normalized language hints that can guide enrichment without replacing
  deterministic language handling.
- Added ordered structured author lists with optional profile links.
- Added publisher-declared original-source attribution in Expanded and Reader
  views.
- Fixed HTML + XPath thumbnail persistence.

### Authenticated feeds

- Added HTTP Basic authentication for protected RSS and Atom subscriptions.
- Credentials are supported during discovery, validation, initial retrieval, and
  scheduled or manual crawls.
- Passwords are encrypted at rest, excluded from normal API responses, and never
  embedded in feed URLs.
- Cross-origin redirects strip credentials and require the destination URL to be
  accepted explicitly.

### Reliability, performance, and operations

- Added a consolidated health summary and total failure counts to observability
  settings.
- Fixed analysis hashing and recovery of failed or stranded AI processing jobs.
- Prevented classification-provider failures from being recorded as successful
  analysis.
- Added and refined Article query indexes and optimized read-tag aggregation.
- Fixed memory exhaustion in large Interest Island overviews and serialized
  conflicting evidence reads.
- Polls the email delivery queue every five minutes so saved SMTP changes and
  pending messages are picked up reliably.
- Improved feed parsing fixtures, publication fallback coverage, migration
  portability, and SQLite/MySQL historical-schema tests.
- Fixed Docker multi-platform build stages and upgraded client, server, inference,
  FeedSmith, dotenv, and ESLint dependencies.
- Added Ubuntu installation, Ollama, OIDC, server-settings, sidebar, category,
  archiving, crawl-contract, and semantic-contract documentation.

## Upgrade notes

- Back up the database before upgrading and allow the normal RSSMonster startup
  process to apply all pending migrations.
- Topics have been removed. Personalization now uses behavior-driven Interest
  Islands directly.
- The personal settings table is migrated from `settings` to `user_settings`.
- Review article-retention settings after upgrading. The default age limit is
  seven years, and nightly cleanup requires the crawl worker.
- Saved sensitive server settings and authenticated feed passwords require a
  stable encryption key. Back up that key together with the database.
- Inference no longer assumes an implicit localhost endpoint. Configure a
  deployment endpoint through the environment or **Settings → AI / Inference**.
- Existing semantic vectors carry model metadata after migration. Vectors from
  incompatible models are deliberately excluded from comparisons.
- Category Event-clustering changes affect future assignments only; they do not
  regroup existing Events automatically.

## Documentation

- [OIDC configuration](docs/oidc-configuration.md)
- [Server settings](docs/server-settings.md)
- [Inference administration](docs/inference.md)
- [Ollama setup](docs/ollama.md)
- [Interest Islands](docs/interest-islands.md)
- [Categories and Event clustering](docs/categories.md)
- [Sidebar settings](docs/sidebar-settings.md)
- [Article archiving](docs/archiving.md)
- [Feeds and HTTP Basic authentication](docs/feeds-and-categories.md)
