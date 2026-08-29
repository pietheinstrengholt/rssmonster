# Settings

## Purpose

Settings is RSSMonster's desktop configuration and operational-insight workspace. It brings together saved article filters, crawl automation, AI thresholds and insights, subscription management, source trust configuration, and user administration.

Each section owns a focused part of the product. Editable sections save independently, while insight sections retrieve current server data without changing it. Successful changes that affect the rest of the application request an overview and article refresh so navigation counts, filters, and visible content remain consistent.

## Dialog behavior

Settings opens as a modal dialog with persistent section navigation and a content area for the active section. It starts on the Welcome section.

The underlying page cannot scroll while the dialog is open. Keyboard focus moves into the dialog, remains trapped within its available controls when using Tab or Shift+Tab, and returns to the Settings opener after the dialog closes. Escape closes the dialog.

Most sections are loaded only when selected. A shared loading state is shown while a section becomes available. Transient loading failures are retried before a shared error state is displayed. This keeps the initial Settings view lightweight and gives all sections consistent failure behavior.

The header subtitle changes with the selected section. Selecting another navigation item replaces only the content panel; it does not close Settings.

## Presentation primitives

`SettingsPageIntro` owns the repeated informational section heading structure used by ordinary Settings overview pages. It accepts the icon, eyebrow, title, and heading identifier while the section supplies its own descriptive text. Its visual treatment remains in the Settings feature stylesheet so light and dark presentation stay consistent at the Settings surface boundary.

`SettingsMetric` owns the compact label-and-value card used by Topics and Islands. Metric grids remain with their sections because responsive grid composition belongs to each page. Icon-led feed statistics, stacked instructional cards, and Smart Folder hero content remain separate because their structure and presentation are intentionally different.

The feature stylesheet provides a small CSS-only vocabulary for ordinary section composition:

- `settings-page` owns the standard readable page width and text color.
- `settings-panel` owns the standard surface, border, radius, and dark-mode treatment.
- `settings-toolbar` owns shared horizontal control alignment.
- `settings-control`, with `--compact` and `--icon-only` modifiers, maps bespoke controls onto the application height and radius tokens.
- `settings-action-footer` owns the sticky trailing action zone below editable content, keeping save controls predictably available while the Settings content scrolls.
- `settings-state`, with `--empty` and `--error` modifiers, owns loading and empty-state alignment.

Primary and secondary actions reuse the application-wide `app-button` variants. Feature-specific cards, data layouts, and editor internals remain locally styled rather than being forced into generic components.

Settings radius values follow four semantic roles: `--radius-dialog` for the modal shell, `--radius-panel` for cards and panels, `--radius-control` for controls and compact notices, and `--radius-pill` for badges, avatars, and round indicators. Do not introduce intermediate numeric radii inside the feature.

## Visibility and access

Navigation is tailored to the current installation and user:

- Welcome, Smart Folders, Actions, Crawl Statistics, Observability, Feeds, and Official Sources are available to regular authenticated users.
- Scores, Topics, Islands, and AI Processing are shown only when AI features are enabled.
- Manage Users is shown only to administrators. The section also protects its content if it is reached without administrator rights.

Hidden navigation is an access and capability boundary, not merely a visual preference. New settings sections should follow the same role and feature-gating behavior.

## Sections

### Welcome

Welcome provides an orientation to the available settings areas and explains what each one controls. It is informational and does not save data.

Sections that complete their own nested workflow may return the user to Welcome while leaving the main Settings dialog open.

### Smart Folders

Smart Folders manages saved article searches that appear in sidebar navigation. The section loads the user's authoritative folder collection before enabling editing. Load failures preserve the server collection and offer a retry instead of exposing an empty editable state.

Each folder has a name, result limit, and generated search query. A folder can be created, removed, edited in place, or saved as a copy. The editor translates user-friendly controls into the stored query and displays that generated query for inspection or copying.

The editor supports:

- Read, unread, favorite, clicked, and hot state filters
- Fixed or relative date ranges
- Tag, title, author, language, and free-text matching
- Quality and freshness thresholds when AI is enabled
- Event and cluster filters when AI is enabled
- Top Stories, Recommended, Quality, and publication-date ordering where supported
- Maximum result sizes of 50, 100, 250, or 500 articles

Mutually exclusive choices remain mutually exclusive. Read and unread cannot both be selected, and conflicting event options disable one another. The generated query is validated using the same search contract used elsewhere in the client. Invalid folders show an explanation and block persistence.

Changes made inside an open editor update the local collection. The section-level Save Changes action persists the complete collection. Saving refreshes the sidebar's smart folders and requests an application refresh so saved navigation stays synchronized.

When AI features are enabled, the section can analyze reading behavior and suggest useful folders. Suggestions include a name, reason, and query. Adding a suggestion creates an editable folder; it does not bypass the normal validation and save workflow.

### Actions

Actions defines ordered crawl-time automation. Each rule matches article titles or content with a regular expression and then applies one operation:

- Discard the article from normal queries
- Mark it as a favorite
- Mark it as read
- Mark it as clicked
- Override its advertisement score as advertising
- Override its quality score as low quality
- Assign a custom tag

Rules are evaluated from top to bottom. A matching discard rule filters the article from normal results and allows expensive downstream processing to be skipped. This order is therefore part of the business behavior, not just display order.

The section loads the existing collection before allowing additions, edits, deletions, or saves. A tag value is required only for tag actions. Rows without an action type are not persisted. Save Changes replaces the saved collection and requests an application refresh. Loading or saving errors leave existing server rules unchanged and provide a retry or error notification.

### Scores

Scores controls the maximum accepted values for advertisement, sentiment, and quality scoring. Articles above a configured threshold are hidden from normal feed results.

All thresholds use a range from 0 to 100 and can be adjusted with either a slider or numeric input. Values are clamped to that range. Lower thresholds filter more aggressively; a threshold of 100 allows every score through.

The three score meanings are:

- **Advertisement** ranges from editorial content at the low end to heavy promotion or spam at the high end.
- **Sentiment** ranges from positive through neutral to negative or alarmist.
- **Quality** ranges from engaging and relevant to shallow or clickbait-oriented.

Reset to Defaults changes the local controls to their default values. It does not persist until Save Changes is selected. Saving updates the current selection state, reloads visible content and overview data, and returns the Settings content to Welcome.

AI scoring depends on backend OpenAI configuration. When scoring is unavailable, new articles receive the documented default score behavior.

### Topics

Topics is a read-only operational view of semantic event and topic processing. Events represent groups of related articles around a current story; topics connect events and articles into longer-running themes.

The section reports:

- Active events, topic totals, event-linked articles, and topic coverage
- Unclustered and unassigned articles
- Event reuse, creation, size, and status distributions
- Topic linkage, coverage, and type distributions
- The largest current events and recently active topics

The data is a fetched snapshot. It changes only when the section is loaded or refreshed, not because the user scrolls or opens an item. Empty states explain that events and topics appear after semantic clustering has produced data. Failures are shown without replacing prior server state.

### Islands

Islands explains the interest clusters RSSMonster has learned from reading,
favorite, and click behavior. The overview is read-only, with one explicit
recalculation action that rebuilds the signed-in user's Islands and article
interest scores from existing evidence.

The overview shows how many islands exist, how many articles are inside and outside them, and the resulting library coverage. Each island can show its activity state, effective interest weight, behavioral evidence, connected topics, source articles, and topic-related articles. Linked articles open in a separate browser context.

The section explains why an island exists rather than providing controls to edit the learned model. Users grow or reinforce islands through normal reading behavior. If no islands exist, the empty state directs users toward reading, favoriting, and clicking relevant articles.

Island data is a fetched snapshot and changes only when loaded, explicitly
refreshed, or deliberately recalculated. Recalculation reports its own success
or failure and then refreshes the overview.

### Crawl Statistics

Crawl Statistics is a read-only daily history of user-triggered crawl activity. It shows new articles, updated articles, completed crawls, and failed crawls for each day.

The available date ranges are the last 7, 30, 90, or 365 days. Changing the range retrieves a new bounded snapshot. Only completed and failed user crawls are included. Loading, empty, and failure states are presented separately, and the user can explicitly refresh the current range.

### AI Processing

AI Processing is an operational view of the current user's optional background queue. It uses the server's canonical healthy, busy, degraded, or stalled state and gives queue health more emphasis than secondary latency and completion details. Internal task names are presented as Article analysis and Semantic labels.

The section refreshes every 30 seconds only while mounted and also provides an explicit refresh control. Polling stops when the user leaves the section. A refresh failure remains local to this view and preserves the last successful snapshot when one is available.

Clear records opens an explicit confirmation before permanently deleting the signed-in user's succeeded and dead job history. Pending, retrying, running, and cancelled jobs remain untouched. Successful cleanup refreshes the status view; a failed cleanup keeps the confirmation available for retry.

### Observability

Observability is a read-only failure inbox for crawl, article, embedding, event, topic, and island processing. It deliberately excludes successful processing statistics and groups abnormal outcomes by their stable failure fingerprint.

The overview can be bounded by date range, processing stage, and failure type. Selecting a group opens its individual occurrences without replacing the Settings section. Selecting an occurrence then loads its captured message, identifiers, retry state, stack trace, and structured context. Group and occurrence lists are paginated so older or less common failures remain available without an unbounded request.

Clear records opens an explicit confirmation before permanently deleting all processing failures owned by the signed-in user. Successful cleanup refreshes the aggregate view; a failed cleanup keeps the confirmation available for retry.

### Feeds

Feeds is the subscription-management overview. It combines operational totals with a searchable table of every feed.

The summary reports total feeds, healthy feeds, feeds needing attention, and total stored articles. Feed rows show:

- Name and source URL
- Crawl health
- Stored article count and average articles per day
- 30-day crawl reliability and latest crawl time
- Trust score

The list can be filtered by crawl health and searched by feed name or URL. Filtering changes only the displayed rows and footer count; it does not mutate subscriptions or metrics.

An individual feed can be opened in the existing feed-editing flow. The section also supports:

- Importing subscriptions and categories from OPML
- Exporting the current subscription hierarchy as OPML
- Recalculating trust and duplication-related feed scores

After an import or score recalculation, the feed overview is fetched again and the wider application is refreshed. Operations expose independent success and error feedback so one failure does not erase the loaded feed list.

Selecting a feed opens its observability details inside the same Settings section, preserving the Feeds navigation state and the retained overview for Back navigation. The detail view loads one bounded health snapshot, then requests expanded attempt diagnostics only when a crawl-history row is selected. It presents rolling health metrics, daily crawl outcomes, failure categories, canonical article statistics, configuration context, and the existing feed-edit action without introducing a separate modal or route.

### Official Sources

Official Sources manages organization-domain mappings used during crawling. Articles from enabled matching domains are marked as official and tagged with the configured organization name.

Rows contain an organization, domain, and enabled state. Users can add, remove, edit, enable, or disable rows locally. Save Changes persists the complete resulting collection and replaces the editor with the normalized server response.

Disabled rows remain configured but do not mark newly processed articles as official. Blank placeholder rows are not intended to become active source definitions. Save failures keep the current editor state available for correction or retry.

### Manage Users

Manage Users is restricted to administrators. It lists RSSMonster accounts and their roles, then provides account editing and deletion workflows.

Administrators can change a username, switch between user and administrator roles, and optionally replace a password. Leaving the password empty preserves the existing password. A replacement password must contain at least eight characters and match its confirmation.

Deletion has a separate confirmation view because it permanently removes the account and its access. Successful edit and delete operations return to a refreshed user directory. Authorization failures are handled as access errors rather than exposing user-management data.
The signed-in account cannot start its own deletion flow; the server also enforces this restriction.

The current implementation manages existing users; account creation is not part of this section.

## Save and refresh expectations

Settings sections follow these principles:

1. Server data must load successfully before destructive or replacing edits are enabled.
2. Local edits remain drafts until the section's save action succeeds.
3. Saving indicators prevent duplicate submissions.
4. Failed saves retain the user's editable state whenever possible.
5. Successful changes that affect feeds, article visibility, sidebar navigation, or account state refresh the relevant local data and wider application.
6. Insight sections remain read-only unless they expose a clearly labeled,
   deliberate operational action such as recalculating Interest Islands.

Some sections save a whole ordered collection rather than one row at a time. For Smart Folders, Actions, and Official Sources, removing an item in the interface remains a local change until the collection is successfully saved.

## Loading, empty, and error states

Every data-backed section should distinguish among:

- Loading data that has not arrived yet
- A successfully loaded empty collection
- A failed request
- A save or operational action in progress
- Successful completion feedback

An API failure must not be presented as an empty collection, because that could invite the user to overwrite valid server data. Retry controls should reload authoritative data without requiring the entire Settings dialog to close.

## Design and maintenance expectations

Settings uses the same calm, content-first visual language as the rest of RSSMonster. Section navigation remains stable, informational cards explain business meaning, editable tables are reserved for genuinely tabular data, and responsive layouts preserve all controls on narrower screens. New styling must support both light and dark themes.

Future sections should preserve:

- Options API component patterns
- Lazy loading for non-default sections
- Role and feature gating
- Modal keyboard and focus behavior
- Independent section persistence
- Clear distinctions between local drafts, saved state, and fetched insight snapshots
- Application refreshes after changes that affect article results or sidebar state
