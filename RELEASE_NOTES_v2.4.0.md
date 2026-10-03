# RSSMonster v2.4.0

RSSMonster 2.4.0 is a substantial update focused on identity and server
administration, behavior-driven personalization, reader controls, feed metadata,
content retention, and deployment flexibility. It contains 133 commits since
v2.3.0.

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
- Added **Remember me** for local sign-in, with an independently configurable
  extended session lifetime. Ordinary and remembered JWT lifetimes are forwarded
  correctly by both Docker Compose profiles.
- Improved development-login handling so bypass requests are not made when the
  bypass is disabled.

### First-run and search experience

- Reworked first-time onboarding around three explicit choices: add a feed,
  import an OPML file, or start with an empty account.
- Starter feeds are now optional, unselected by default, and organized into
  browsable topic groups.
- Added persistent onboarding completion so returning users do not repeat the
  first-run flow.
- Added a dedicated no-results search illustration, clearer recovery actions,
  and practical search tips.

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

### Settings, Actions, and quality controls

- Grouped Settings navigation into Reading, Subscriptions, Automation,
  Troubleshooting, and Administration, with a compact section picker on smaller
  screens.
- Actions and Smart Folder drafts now survive section switches, and Settings
  warns before closing with unsaved changes.
- Automation Actions can use a simple case-insensitive phrase or an advanced
  regular expression.
- Added a read-only Action preview that checks up to 100 recent eligible articles
  before the rule is saved.
- Actions can be reordered by drag-and-drop, keyboard controls, or explicit move
  buttons; saved order remains execution order.
- Added an independent **Overall quality** threshold from 0 to 100 while retaining
  the existing writing, tone, and ad-free controls under Advanced.
- Renamed the source-aware quality sort to **Quality & source trust** so it is not
  confused with the article-only Overall quality score.

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

### Desktop local AI

- RSSMonster Desktop now starts the local inference service and AI worker as
  managed Electron utility processes.
- Desktop bundles the runtime for ModernBERT classification, Qwen3 embeddings,
  and Qwen3.5 generation. Models download into the user-data directory on first
  launch and are reused on later starts.
- The reader can open while models initialize and enables AI after readiness is
  confirmed. The Assistant remains disabled by default.
- Desktop still refreshes feeds manually: the AI worker processes enrichment
  jobs, but no crawl worker or scheduled feed refresh is started.
- Added clean startup and shutdown coordination for the server, inference service,
  and AI worker, including bounded termination for stalled services.
- Fixed packaged parser dependencies and ESM migration discovery, removed the
  default Electron application menu, and expanded packaged-runtime verification.

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
- Added a searchable, filterable **Settings → Islands** overview with evidence
  inspection and example articles. Interest names in **Why recommended** link
  directly to the relevant Island inspector.
- Islands can be muted or unmuted for future interest scoring while preserving
  their evidence and lifecycle. Muting does not rewrite stored article scores.
- Added feed-level personal-interest affinity from recent eligible articles and
  positive Island matches, refreshed during Island recalibration. Feeds without
  supporting evidence remain unscored.

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
- Added adaptive unread age filters with three rolling cutoffs plus **All**.
  Cutoffs range from hours to 30 days based on the oldest article in the complete
  matching result set, independently of pagination and the selected age cutoff.
- Added calendar filters for Today, Yesterday, This week, This month, and custom
  date ranges. The unrestricted calendar option is labeled **All dates** to
  distinguish it from the independent rolling age filters.
- Age selections reset to **All** when unavailable in a new result context.
- Added a sticky date context that follows the visible article while preserving
  the selected sort order.
- Hid the date label below 1070px and the article/source summary below 876px to
  keep the context controls usable on narrower screens.
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
- Renamed Favorites to **Saved** and Clicked to **Opened originals**, clarifying
  that outbound publisher visits are separate from read state.
- Added a sidebar preference to mark only currently visible articles as read;
  the default continues to mark the complete matching selection.
- Reader bulk actions labeled “visible” now operate only on list rows actually in
  the viewport rather than every loaded article.
- More like this, Not interested, and feed muting now show confirmed success
  notices without unexpectedly removing the article from the current view.
- Recoverable article, feed, settings, and refresh failures retain the user's
  input and provide contextual retry controls.
- Prevented mobile article menus from being clipped at viewport and scroll-pane
  edges.
- Reduced mobile swipe rendering overhead and preserved pinch-to-zoom gestures
  by suspending swipe and pull-to-refresh handling while zoomed or using multiple
  touches.

### Hot articles and Daily Briefing

- Hot articles receive a bounded boost in Recommended and Top Stories ordering
  based on links from other feeds in the user's subscriptions.
- Added **Include Hot articles** to briefing preferences, enabled by default.
  Hot articles can qualify alongside personal-interest and Event evidence while
  still respecting briefing filters.
- Disabling the preference excludes Hot articles even when they also qualify
  through interest or Event evidence.

### Configurable sidebar and shortcuts

- Added persisted sidebar configuration for count display, count decluttering,
  zero-count visibility, favicons, and section order.
- Added sorting by manual order, name, selected count, total count, or recent feed
  activity, plus **Personal interests**.
- Personal-interest sorting orders feeds by affinity, with unscored feeds last,
  and categories by their combined feed affinity. Equal scores retain the
  existing fallback order.
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
- Added a per-feed ongoing article admission window in **Update feed**, ranging
  from three days to five years and defaulting to 30 days.
- After the initial import, unseen entries must satisfy both the feed's admission
  window and the user's maximum article age, preventing older entries from being
  reimported after cleanup.
- Changing an admission window affects later crawls without deleting stored
  articles or restarting the initial import. Existing articles can still receive
  revisions, and initial imports and their retries retain the selected history.

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
- Added explicit MariaDB 11.4 support through `DB_DIALECT=mariadb`, using the
  supported MySQL connector and a MariaDB-compatible baseline schema.
- Crawl progress now reports the full eligible-feed total before parallel claims
  complete and numbers feeds consistently in claim order.
- Pinned CI execution to Ubuntu 24.04 and expanded desktop and
  article-presentation regression checks.
- Added Ubuntu installation, Ollama, OIDC, server-settings, sidebar, category,
  archiving, crawl-contract, and semantic-contract documentation.
- Added a root `npm run dev` command to start the server, client, inference
  service, and workers together.
- Removed unused client, server, and inference helpers and obsolete semantic
  test execution/reporting code while retaining active tests and compatibility
  interfaces.

## Upgrade notes

- Back up the database before upgrading and allow the normal RSSMonster startup
  process to apply all pending migrations.
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
