# RSSMonster v2.4.0

RSSMonster 2.4.0 is a substantial update focused on identity and server
administration, behavior-driven personalization, reader controls, feed metadata,
content retention, and deployment flexibility. It also adds offline reading,
operational webhooks, reusable Smart Folders, manual article tagging, browser
text-to-speech, outbound feed-proxy support, and a fully portable Windows
Desktop distribution.

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

### Operational webhooks

- Added **Settings → Webhooks** to create, edit, enable, pause, or delete
  user-owned webhook configurations backed by authenticated APIs.
- Conditions can match feed, category, title, author, URL, domain, article text,
  or language, with **All conditions** or **Any condition** matching.
- Newly accepted articles queue durable JSON deliveries; existing articles and
  later revisions do not trigger another delivery.
- Added a separate delivery worker with bounded concurrency, timeouts, retry
  delays, and up to five delivery attempts. The supplied Compose profiles and
  root development command include the worker.
- Added optional HMAC-SHA256 signatures with encrypted signing secrets. Responses
  omit saved secrets, and deliveries carry stable identifiers so receivers can
  handle retries safely.
- Removed the obsolete notice that webhook delivery was unavailable now that
  configuration, matching, queuing, and delivery are operational.

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

### Windows portable Desktop

- Added a separate `RSSMonster-Portable-<version>-x64.exe` alongside the existing
  `RSSMonster-Setup-<version>-x64.exe` installer. GitHub desktop release builds
  now include both Windows artifacts.
- Portable Desktop requires no installation and automatically creates `data/`
  beside the original executable. SQLite, persistent secrets, downloaded models,
  worker health, and Electron/Chromium state remain under that directory.
- Portable storage follows the launcher's actual location, independently of the
  current working directory or its temporary application extraction directory.
  Paths with spaces and moving the portable folder preserve the stored data.
- Unwritable storage shows a clear startup error instead of falling back to
  AppData. Installed Desktop continues using its existing application-data
  directory without automatically moving or importing profiles.
- Users can close the app and move or back up the complete folder. Upgrades
  replace only the executable and preserve `data/`; normal migrations run on
  the next launch.
- Aligned the packaged Umzug dependency with the shared migration runner's
  existing API, fixing a packaged SQLite startup failure. Added storage and
  packaging regression tests and native Windows create/restart verification,
  including folder relocation, existing-token validity, and no AppData profile.

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
  current unread-list baseline. Reader now spells out “new article” or “new
  articles” alongside the count.
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
- Refined the new-article banner and sticky context bar across article views,
  including clearer spacing, consistent mobile widths, and left-aligned compact
  filters. Summaries hide or shorten on narrower screens while the collection
  action menu remains available.
- Empty Reader collections hide the date selector rather than offering filters
  with no article context.
- Improved unread-filter reset, custom-date dismissal, count refresh, and mobile
  tuning controls.
- Refresh checks now distinguish newly stored unread articles from changes that
  do not belong in the active result window.

### Reader and presentation improvements

- Added a sticky selected-article toolbar with read/unread, save/unsave, and Open
  original actions, plus text size, listening, expand/restore, and the article
  menu on the right. Related articles retain their existing controls.
- Added **Aa** text-size choices: Small, Medium, and Large. The browser remembers
  the selection; Medium preserves the current typography exactly. Reader title,
  body, headings, captions, and code scale together while toolbar controls,
  metadata pills, recommendations, and list/sidebar text retain their sizes.
  The title keeps its responsive sizing.
- Added native browser text-to-speech for the rendered Reader article body,
  excluding the title, metadata, controls, hidden content, and known ad wrappers.
  The headphones button starts reading, then pauses/resumes on subsequent clicks.
  Playback stops when changing articles, leaving Reader, or unmounting; browsers
  without speech support hide the control. No backend audio generation or stored
  audio is required.
- Added expand/restore for the selected article: hide the middle list while
  keeping the sidebar visible, then restore the three-pane layout. The transition
  respects reduced motion and keeps the selected article, reader scroll, and
  playback state intact without browser fullscreen.
- Moved the feed favicon into the Reader metadata bar and removed the repeated
  source header. Author and Original source badges remain available. Badges stay
  on one row as the pane resizes; only those that overflow move into a three-dot
  disclosure, and very narrow labels truncate instead of wrapping.
- Reworked the Reader list header into one aligned row for the collection
  title/count, date filter, Details, and bulk menu, with more breathing room at
  both edges and between controls. The title shows the total article count;
  Details reveals loaded-event and source counts and top tags without repeating
  the unread count. Long labels truncate while controls remain accessible.
- Moved **Save as smart folder** into the collection's **More actions** menu for
  active searches and removed the redundant Original article header action;
  publisher links and the selected Reader toolbar's **Open original** remain.
- Added bulk actions to Expanded, Summarized, Summary Bullets, and Headlines,
  including compact layouts, using the same menu as Reader. Relative read
  actions use the selected/open article or the article nearest the viewport top
  and operate on loaded articles; visible actions target on-screen rows.
- Auto-hide Reader list/content and Expanded scrollbars and prevent nested
  scrolling across desktop article streams. Expanding a Headlines article
  preserves its row's viewport position.
- Refined first-article dividers, toolbar and metadata alignment in both themes,
  and simplified the quality filter's button label to **Quality**.
- Centered Reader toolbar icons and labels and corrected favicon alignment in
  both themes. Reader list timestamps now prefer publication date, falling back
  to first-seen time only when publication date is unavailable.
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

### Audio and media presentation

- Added feed labels, available duration, and playback-speed choices from 1× to 2×
  to native audio players, with clearer accessible player names.
- Added audio indicators to article headings and Headlines rows so playable
  audio is easier to identify while scanning.
- Improved native video recognition for direct media sources and corrected
  audio/video fallback-link labels when structured feed media and inline
  publisher media differ.

### Read-only offline PWA reading

- Added **Settings → Offline reading** to prepare the latest articles while
  connected, with preparation progress, refresh, and clear-data controls. Download
  sizes now support 100, 250, 1,000, 2,500, or 5,000 articles.
- Downloads are isolated by device, account, and server, and stored in IndexedDB.
  An incomplete refresh keeps the previous complete download available.
- Previously validated sessions can open prepared articles when the server is
  unreachable, including stored text, metadata, tags, and captured read/saved
  state.
- Offline mode is read-only: live search, recommendations, external streams, and
  article mutations are unavailable, and changes are not queued for later sync.
- Disabling preparation retains downloaded articles; signing out or clearing
  offline data removes the account's local downloads.

### Smart Folders and manual article tagging

- Added **Save as smart folder** to collection actions for active searches,
  including compact layouts, with a named draft and rule preview based on the current status,
  search, tag, sorting, grouping, quality threshold, and supported date presets.
- The dialog explains when feed/category context or publication-date controls
  cannot be represented by Smart Folder rules. Saved folders remain dynamic
  queries rather than snapshots of the current list.
- Added **Add tags** and **Manage tags** to the article menu, including inline
  creation, multi-tag selection, and removal of individual article assignments.
- Manual tags reuse the existing user-owned Tag model and behave consistently in
  article rendering, search, Smart Folders, and sidebar navigation. Removing an
  assignment leaves the same label on other articles intact.
- Tag dialogs show current selections immediately and load small default
  suggestions instead of the complete catalogue. Debounced server-side search
  returns bounded results, with selected matches first and stale responses
  ignored.
- Saved changes update article metadata and sidebar counts without reloading the
  article list; interrupted saves preserve selections and retry remaining changes.
- Improved multiword and escaped tag-name handling in search and Smart Folder
  expressions, mobile tag visibility, native checkbox styling, dialog typography,
  and keyboard focus.

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

### Outbound feed proxies

- Added `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` support, including lowercase
  variants, for shared feed acquisition: discovery, validation, manual/scheduled
  crawls, HTML/XPath previews, and OPML connection checks.
- Both Docker Compose profiles forward proxy configuration to the web service
  and crawl worker. Lowercase variables take precedence, including empty values.
  This setting is separate from inbound reverse-proxy `TRUST_PROXY` handling.
- Retained bounded retries, deadlines, response limits, and redirect credential
  stripping. Proxy errors do not silently retry through a direct connection, and
  proxy diagnostics avoid exposing proxy credentials.
- Direct requests retain existing destination safeguards. Proxied DNS resolution
  and destination filtering belong to the trusted proxy; `NO_PROXY` changes
  routing and does not grant access to private destinations.

### Reliability, performance, and operations

- Article pagination now prefetches ahead of the list end using the active
  layout's scroll surface, including Reader, Expanded, and mobile viewport
  layouts. Observers remain attached across page appends and reconnect when the
  scroll root or target changes.
- Prevented cascading page requests while the load sentinel remains visible and
  prevented overlapping pagination during collection changes. Short result
  pages offer **Load more articles**; automatic loading resumes after a fresh
  exit/re-entry rather than filling the viewport with repeated requests.
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
- Set the example feed-parser timeout to ten seconds for slower hosts. The
  unset code fallback remains two seconds; existing configured values are unchanged.
- Centralized bulk read-state updates so article layouts share persistence,
  pending-operation handling, and read-count updates.
- Fixed Docker multi-platform build stages and upgraded client, server, inference,
  FeedSmith, dotenv, and ESLint dependencies.
- Updated desktop Electron, archive tooling, and migration dependencies.
- Excluded API routes from the PWA navigation fallback so API requests retain
  their normal responses instead of receiving the application HTML shell.
- Added explicit MariaDB 11.4 support through `DB_DIALECT=mariadb`, using the
  supported MySQL connector and a MariaDB-compatible baseline schema.
- Crawl progress now reports the full eligible-feed total before parallel claims
  complete and numbers feeds consistently in claim order.
- Pinned CI execution to Ubuntu 24.04 and expanded desktop and
  article-presentation regression checks.
- Added Ubuntu installation, Ollama, OIDC, server-settings, sidebar, category,
  archiving, crawl-contract, and semantic-contract documentation.
- Updated guides for offline reading, webhooks, Smart Folders, initial feed
  imports, admission windows, backups, runtime configuration, API conventions,
  and worker commands. Expanded Desktop documentation for portable storage,
  build/verification commands, writable folders, and backup/upgrade workflows.
- Expanded the Smart Folder, tag, webhook, unread-setting, and theme guides
  with current controls and screenshots.
- Consolidated contributor agent skills under `.agents/skills`, with shared
  design, review, test-first, and implementation-closing workflows.
- Added a root `npm run dev` command to start the server, client, inference
  service, and workers together.
- Removed unused client, server, and inference helpers and obsolete semantic
  test execution/reporting code while retaining active tests and compatibility
  interfaces.

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
- Reader text size is a browser-local preference; expand/restore state is local
  to the current Reader layout. Browser speech availability and voices depend
  on the browser/platform.
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
- [Bulk actions and read-state behavior](docs/marking-articles-read.md)
- [Desktop and server backups](docs/backup-restore.md)
- [Build and verification commands](docs/npm-commands.md)
- [Reader implementation notes](client/src/components/articles/README.md#desktop-reader)
- [Smart Folders](docs/smart-folders.md)
- [Tags and manual article tagging](docs/tag.md)
- [Offline PWA reading and notifications](docs/web-app-and-notifications.md)
- [Webhooks and delivery worker](docs/webhooks.md)
