# Domain glossary

## Unresolved inconsistencies and conflicts

No unresolved items remain from this review.

## Scope and usage

This glossary covers domain language found in client components, stores,
composables, services, API wrappers, and client tests. Supporting repository
documentation supplies established scoring and processing meanings where the
client consumes server results. It is not an exhaustive backend schema glossary.
Code identifiers in backticks record existing contracts, not proposed renames.

## Articles, subscriptions, and organization

### Article

A stored item presented for browsing or reading, with its title, publication URL,
content, source metadata, read/save/opened state, and optional analysis, media,
Event, and recommendation data. Reading an Article in RSSMonster and opening its
original website are separate actions.

### Canonical Article, duplicate, and revision

A canonical Article is the primary record to which duplicate versions refer
through `duplicateOfArticleId`. **Duplicates** expands supporting versions after
that Article. An Event sibling or semantic recommendation is not automatically a
duplicate. A publisher revision is updated coverage of an existing item rather
than necessarily a new Article; the client consumes the server's identity and
revision decisions.

Evidence: [Article API](client/src/api/articles.js),
[expansion behavior](client/src/components/articles/helpers/articleExpansion.js),
[domain invariants](AGENTS.md#domain-invariants).

### Feed and subscription

A Feed is a subscribed source of Articles. Its subscription has a display name,
feed URL, category, scheduling/configuration, health, and optional authentication.
The feed URL used for fetching and its origin website are different destinations.
Disabling a Feed and setting its update interval to manual-only are separate
configuration choices.

### Category

A user-managed grouping of Feeds, used to scope Articles and aggregate feed
counts. Categories can be reordered and have a name, icon, and optional Event
clustering behavior. Selecting a Feed retains its parent Category.

### Event clustering behavior

A Category's optional `aggressive`, `moderate`, or `conservative` clustering
choice; a null value selects Server default. This controls semantic processing,
whereas the article **Grouping** selector controls presentation of its results.

Evidence: [Sidebar contract](client/src/components/sidebar/README.md),
[feed editing](client/src/components/dialogs/feeds/UpdateFeed.vue),
[clustering choices](client/src/components/dialogs/categories/CategoryClusteringSelect.vue).

### Tag, rule tag, and Top Tags

A Tag is an Article label used for navigation and search. Stored names are
normalized to lowercase; display formatting can change capitalization. Tags can
be edited through article controls or assigned by Actions. Rule-assigned tags
also appear in server-supplied recommendation explanations. **Top Tags** is a
fetched, status/presentation-scoped navigation snapshot, not a count recomputed
from only the rendered Articles. The Smart Folder visual editor’s **Tag** field matches one tag, including
names containing spaces; it does not select multiple labels.

Evidence: [Tag normalization](client/src/utils/tags.js),
[tag dialog](client/src/components/articles/ArticleTagDialog.vue),
[recommendation reasons](client/src/services/articleRecommendationPresentation.js),
[Sidebar counts](client/src/components/sidebar/README.md#count-expectations).

### Smart Folder

A named, saved Article expression with a result limit and its own optional
mark-read-on-scroll preference. Its expression owns sort and grouping while
active. Leaving it restores ordinary presentation; editing search exits the
saved-folder context. Counts are fetched snapshots. **Save current view** creates
a draft from supported filters, not an exact clone of every navigation ID,
publication-age control, or advanced component threshold.

### Search expression and condition

Search and Smart Folders share a language of free text, quoted values, filter
tokens, date expressions, and presentation tokens. Examples include
`unread:true`, `saved:true`, `openedOriginal:true`, `seen:true`,
`hot:true`, `event:true`, `developing:true`, `briefing:true`, `eventCount:>=2`,
`tag:ai`, `title:"climate policy"`, `author:Jane`, `language:en`,
`quality:>=0.75`, `freshness:>=0.5`, `firstSeen:7d`, `id:>100`, `@today`,
`sort:recommended`, `grouping:event`, and `limit:50`. These are client-recognized
expressions; validation does not itself evaluate Articles. Automation Action,
feed item-filter, and Webhook conditions have separate languages.

Evidence: [Query validation](client/src/services/queryValidation.js),
[Smart Folder presentation](client/src/services/smartFolderPresentation.js),
[current-view conversion](client/src/services/currentViewSmartFolder.js).

## Collection and reading state

### Selection, scope, and collection

**Selection** is the active set of Article filters and presentation choices.
**Scope** narrows it by Feed, Category, Tag, search, or Smart Folder. A
**collection** is the ordered result loaded for that selection. Status options
include read/unread state, saved/opened/Hot subsets, and Daily Briefing; they are
not mutually exclusive properties of an Article. Selecting a Category, Feed,
Tag, or Smart Folder clears incompatible filters through the selection store.

### Snapshot, loaded Articles, and visible Articles

A collection snapshot stabilizes pagination and selection identity. Loaded
Articles are those fetched into the client; visible Articles are on-screen rows
or cards in the active reading viewport. **Mark selection read**, **Mark all
visible as read**, and selected-row-relative actions therefore have different
targets. Temporarily inserted Event members and duplicates remain associated
with their parent.

### New articles, unread baseline, and new-only selection

The new-articles banner counts matching unread Articles with IDs above the
browser's stored unread baseline. That baseline is the maximum ID from the last
successfully loaded full unread result, scoped by browser, account and selection;
it is separate from the cursor pagination snapshot's library-wide maximum ID.
**Show new only** applies explicit unread constraints and an ID filter while
retaining the selection's other filters. **Show full list** removes that temporary
constraint and updates the baseline after a successful replacement load. An
age-limited subset does not advance the full unread baseline. “New”
means a newer stored ID, not necessarily a newer publication timestamp.

### Selection count, total count, and sidebar preferences

Sidebar counts describe the selected status or saved-expression snapshot;
Category counts aggregate their Feeds. **Show total count** displays selected/total
(for example, 9/109). **Declutter counts** omits redundant totals, and
**Hide zero-count items** hides empty navigation entries while retaining the
All feeds filters. These are display preferences, not Article visibility rules.

Evidence: [Selection store](client/src/store/selection.js),
[Article collection documentation](client/src/components/articles/README.md#collection-loading),
[unread baseline](client/src/services/unreadBaseline.js),
[arrivals and pagination](client/src/components/articles/feed/pagination.js),
[new-Articles banner](client/src/components/articles/NewArticlesBanner.vue),
[sidebar preferences](client/src/components/dialogs/SidebarConfigurationModal.vue).

### Read and Unread

An Article's completion state, changed explicitly or by established reading
interactions. Reader marks the previously selected unread Article read when
selection moves away; scrolling preferences govern passed Articles in stream
and Headlines presentations. Read state is independent of saving, opening the
original, and negative-interest feedback.

### Seen, first seen, attention, and deep read

**Seen** records exposure, with `firstSeen` preserving the initial exposure
time. Headline-only exposure can record zero seconds without marking read.
**Attention** is accumulated visible reading time for actual readable content,
including already-read Articles and when automatic mark-read is disabled.
**Deep reads** is a server-supplied behavioral-evidence category shown in the
interest inspector; it is not synonymous with read status or any headline
exposure. The client does not define the learned deep-read threshold.

### Saved, unsaved, and opened originals

**Saved** is the bookmark flag (`savedInd`, status/query `saved`); **unsaved**
clears it. **Opened originals** uses `openedOriginalCount` and status/query
`openedOriginal`, which can also be explicitly marked or cleared. The clocks are
`savedAt` and `lastOpenedOriginalAt`. Expressions use `saved:true` and
`openedOriginal:true`. An Action can mark
an original opened without navigating there, so the state is not proof of an
actual browser visit. Neither state implies read completion.

### Mark as read while scrolling

An optional read-state transition after an unread Article has been visible and
passed above the viewport. Ordinary selections, Daily Briefing, and Smart
Folders own separate effective preferences. Reader's selection-change behavior
and attention observation are independent of this switch.

Evidence: [Read-state contract](docs/marking-articles-read.md),
[visibility tracking](client/src/components/articles/feed/visibilityTracking.js),
[interest evidence](client/src/services/interestPresentation.js),
[Actions](client/src/components/settings/SettingsActions.vue).

### Bulk read

An explicit operation that marks unread, owned, canonical Articles as read using
selected article IDs, a supplied list snapshot, or a matching query. An empty
snapshot selects nothing. Event grouping can include canonical unread siblings of
selected Event members. Completed writes remain completed if a later write fails.

See [manual and bulk actions](docs/marking-articles-read.md#manual-and-bulk-actions).

### Publication date, date range, age cutoff, and first-seen range

Publication time (`publishedAt`) drives chronological ordering and freshness.
Unread calendar ranges use local-day boundaries; custom ranges include the
chosen end day through an exclusive next-day boundary. An unread **age cutoff**
is a rolling publication-age limit fixed when a collection starts.
`firstSeen:7d` includes Articles never shown on screen plus those first shown
within the last seven days, regardless of publication date. Smart Folder time
choices and rule previews distinguish that exposure window from publication time.
Date and age selections reset the competing control in the selection store.

Evidence: [Date ranges](client/src/services/articleDateRange.js),
[age cutoffs](client/src/services/articleAgeCutoff.js),
[Smart Folder query builder](client/src/components/settings/smartFolders/smartFolderQuery.js).

## Reading presentation and content

### Reader, Expanded, Headlines, Summarized, and Summary bullets

- **Reader** (`reader`): a list pane and selected-Article reading pane, alongside
  the sidebar at widths of at least 1024px; below that it falls back to a stream.
- **Expanded** (`expanded`): a continuous stream of available rich Article content.
- **Headlines** (`headlines`): compact rows with content revealed for the opened row.
- **Summarized** (`summarized`): the first 100 words of normalized `contentText`.
- **Summary bullets** (`summaryBullets`): stored `contentSummaryBullets`, with an
  explicit unavailable state when no usable summary exists.

**Expand** in the Reader toolbar hides its list pane while preserving the
selected Article. It is separate from switching to **Expanded** mode.
**Listen** uses browser speech synthesis for currently rendered readable text.

### Shell mode

Width-driven navigation presentation: **mobile** below 768px, **hybrid** from
768–879px, and **desktop** at 880px and above. These shell modes are separate from
Article view modes and Reader's 1024px layout boundary. Tablet/touch and portrait
behavior can additionally affect interactions.

### Predicted reading affinity

Server-supplied `presentation.predictedAffinity`: `deep`, `medium`, `skim`, or
`cold`. For unread Articles the client uses it to vary bullet detail and hide
the fallback image for cold affinity. This is a presentation hint, distinct from
the Recommended score and recorded deep-read evidence.

### Theme mode and Reader text size

**Theme mode** is `system`, `light`, or `dark`; system mode follows the device's
color-scheme preference, while explicit modes override it. **Reader text size**
is Small, Medium, or Large, stored as a browser preference with Medium as the
fallback. It affects Reader typography rather than Article content or read state.

Evidence: [Reading modes](client/src/config/articleSelectionOptions.js),
[Article presentation](client/src/components/articles/Article.vue),
[Reader behavior](client/src/components/articles/README.md#reader),
[shell boundaries](client/src/config/responsiveLayout.js),
[theme modes](client/src/services/theme.js),
[Reader text size](client/src/services/readerTextSize.js).

### Content, description, summary, and preview

Rich display content uses `contentHtml`, then legacy `content`, then
`descriptionHtml`, then an escaped legacy `description` fallback. `contentText`
is canonical plain text used for the shortened preview; summary bullets are a
separate stored analysis output. A **preview** is content/media available inside
RSSMonster, with an explicit fallback linking to the original when unavailable.
The server's `contentOriginal`, `contentStripped`, `contentText`, and
`description` contracts remain distinct; client presentation is not permission
to interchange those processing fields.

### Media, lead image, authors, and Original source

**Media** is the normalized attachment object, covering video, audio, image,
gallery, and other attachments. A **lead image** is separate fallback imagery,
omitted when already present in rich content or unsuitable for display.
**Authors** is the ordered structured byline; legacy `author` remains an unsplit
compatibility fallback. **Original source** is publisher-declared source
attribution, separate from the subscribed Feed, author, and original Article URL.

Evidence: [Article content selection](client/src/components/articles/Article.vue),
[content normalization](client/src/services/articleContentService.js),
[media and attribution contracts](client/src/components/articles/README.md),
[content field invariants](AGENTS.md#domain-invariants).

## Events, interests, and ranking

### Event, representative Article, and Event grouping

An **Event** groups coverage of an occurrence; generated names explain its
presentation rather than independently establishing identity. A
**representative Article** is the server-selected Article representing that
Event. **Event grouping** (`grouping:event`) changes which Event coverage is
presented together; expanding **other articles in this event** fetches other
Event members.
`grouping:none` presents the ungrouped collection. Neither grouping nor matching
generated labels makes Articles deterministic duplicates.

### Developing story and developing Article

A **developing Article** is selected by the server to surface new coverage of an
Event already seen by the user. The strict **developing story** predicate
(`isDevelopingStory`, queried through `developing:true`) concerns the unread
developing Article when it differs from the representative. Including developing
coverage is distinct from restricting a collection to that predicate. Briefing
also has a separate preference for developing coverage in its morning summary.

### Coverage, source diversity, Trending, and Major event

Coverage uses Event Article counts; source diversity uses distinct Feed counts.
The client labels Events with more than four sources **Trending**, or more than
six **Major event**, with Major event taking precedence. **Same story, different
sources** opens other feeds' coverage. These labels are coverage signals, not
assertions of factual verification or publisher independence.

### Interest Island, interest evidence, and preference

An **Interest Island** is a learned personal-interest cluster, presented in
**Your interests** and the interest inspector. Evidence includes saved Articles,
opened originals, deep reads, and negative feedback. Preference can be positive,
neutral, or negative; Island activity state and signed weight are separate from
relationship confidence. The client displays server attribution and does not
recompute semantic confidence. **Your interests** offers search, polarity and
lifecycle filters, sorting, evidence inspection, and mute/unmute. Backend
recalculation is separate from inspecting these results.

**Active** and **Archived** are lifecycle states, distinct from positive/neutral/
negative preference. **Muted** is a separately stored user choice, not a negative
preference or a lifecycle state. Muting excludes the Island from future
Island-based scoring while preserving evidence and lifecycle; unmuting restores
subsequent participation. Neither toggle immediately rescores existing articles.
**Evidence strength** displays the bounded
magnitude of signed weight on a 0–100 scale, not recommendation confidence.
Evidence bars compare counts within an interest, not their scoring weights.

**Semantic affinity** (`semanticAffinityScore`) is the continuous strongest positive
Interest Island contribution, using the same preference/confidence-weighted squared
positive cosine similarity. It has no matching threshold, behavioral
fallback or distinct-Island selection. One positive Island can produce affinity;
null means unevaluated and zero means evaluated without supported positive affinity.
Recommended weights it at 0.10 by default; it does not change Briefing eligibility.

### More like this, Not Interested, and mute Feed

**More like this** records explicit positive recommendation feedback.
**Not Interested** records negative preference without removing the current
rendered Article. **Mute Feed for 7 days** is a separate confirmed source action,
not a synonym for either negative feedback or permanently disabling a Feed.

### Recommended and related recommendations

**Recommended** (`sort:recommended`) is personalized ordering from the server's
combined signed interest, semantic affinity, freshness,
corroboration, rule, and Hot signals. Quality has no direct default weight;
dedicated Quality sorting and eligibility filters remain available. An eligible Article can have a finite score without an Event, Island,
or interest match. The displayed percentage is a signed score scale, not a
probability. Explanation reasons describe contributions, not a new score
computed by the client. Reader **recommendations** are a separate fetched list
for a selected Article, distinct from expanding its Event or duplicates.

### Top Stories, Newest, and Oldest

**Top Stories** (`sort:topStories`) is non-personalized, Event-driven ordering
using coverage plus freshness and quality; Articles without Events remain
eligible. **Newest** (`desc`) and **Oldest** (`asc`) are chronological ordering,
subject to **Prioritize trusted feeds in Unread**, which can change those
chronological orders. It does not change Recommended, Top Stories, or Quality &
source trust sorting.

Evidence: [Event presentation](client/src/components/articles/ArticleMeta.vue),
[Event API](client/src/api/events.js),
[Briefing developing filters](client/src/components/briefing/README.md#article-selection),
[signal labels](client/src/components/articles/helpers/articleSignals.js),
[interest evidence](client/src/services/interestPresentation.js),
[interest inspector](client/src/components/interests/InterestInspector.vue),
[interest DTO](server/controllers/interests.js),
[Article feedback](client/src/components/articles/helpers/articleActions.js),
[recommendation presentation](client/src/services/articleRecommendationPresentation.js),
[ranking contract](docs/scoring.md).

### Overall quality, writing quality, Tone, and Ad-free content

**Overall quality** (`quality`) is article-only content quality on a normalized
0–1 scale: 50% writing quality, 25% tone, and 25% ad-free content. Its UI uses a
0–100 scale. **Writing quality** (`qualityScore`), **Tone** (`toneScore`), and
**Ad-free content** (`advertisementScore`) are separate 0–100 components, with
higher values better. Higher Tone means more neutral, balanced language, not a
more positive subject. Higher advertisement score means less promotion.
The overall-quality threshold is `minOverallQualityScore`; component thresholds
are `minQualityScore`, `minToneScore`, and `minAdvertisementScore`. Runtime inputs and responses use
only canonical score properties.
**Score thresholds** restrict eligibility; 0 disables the corresponding Settings
gate. Query `quality:>=0.75` means overall quality of at least 75/100.

### Quality & source trust, FeedTrust, and official source

**Quality & source trust** (`sort:quality`) combines article quality with
**FeedTrust** (`feedTrust`), a user-specific source-history score. It is separate
from the article's overall-quality badge and filters: the ranking signal uses
70% article-only quality and 30% FeedTrust. The client labels a Feed
trusted above 0.85. Missing, null or nonfinite FeedTrust uses the neutral prior
0.75; finite estimates, including zero, remain meaningful. An **official source** matches an enabled organization/domain
mapping and is presented as **Official source**, with its configured organization
when available. This is configured recognition, not verified provenance or
independent reporting.
Official and trusted-source labels are separate signals; the former takes
precedence in the signal bar. Trust is separate from crawl reliability.

### Freshness and Hot

**Freshness** is publication-time recency used by rankings and normalized query
thresholds. **Hot** (`hotInd`) means recent stored coverage is linked by accepted
Articles from other subscribed Feeds in the user's account. `hotlinks` counts
qualifying link observations, not readers or necessarily distinct Feeds. Hot is
not equivalent to Trending, Major event, quality, or personal interest.

Evidence: [Quality breakdown](client/src/components/articles/ArticleQualityExplanation.vue),
[threshold controls](client/src/components/settings/SettingsScores.vue),
[trust/official labels](client/src/components/articles/helpers/articleSignals.js),
[scoring definitions](docs/scoring.md), [Hot definition](docs/hot-articles.md).

## Briefing and delivery

### Daily Briefing and morning summary

An AI-enabled, event-aware recent Article collection selected with the user's
Briefing preferences. It defaults to a rolling seven-day publication window,
read and unread Articles, one required source feed, and Hot inclusion. The **context strip** gives collection
statistics; the **morning summary** (“The stories shaping your morning”) presents
up to four distinct Event stories with source-grounded excerpts. The structured
introduction is separate from the normal Article list, and is compact in Reader.

### Briefing preferences

Per-user eligibility and presentation choices: rolling selection period
(`24h`/`7d`), unread-only, scrolling read behavior, Hot inclusion, minimum distinct
feeds (labeled **Minimum distinct sources**), articles with positive or negative
learned preferences, developing-story-only selection, developing coverage in the
summary, and Recommended summary ordering. The two “show only” choices are mutually
exclusive. Some preferences are server-side and need not appear in query text.

### Daily briefing email, SMTP, and Web Push

**Daily briefing email** is optional scheduled delivery using the account's
verified email, chosen local delivery time/timezone, and empty-briefing policy.
**SMTP** configures server outbound mail, including verification/reset messages.
**Web Push** sends browser notifications for new Articles; server VAPID
configuration and a browser's notification subscription are different concerns.

Evidence: [Briefing contract](client/src/components/briefing/README.md),
[account delivery controls](client/src/components/settings/SettingsAccount.vue),
[SMTP configuration](client/src/components/settings/SettingsSmtp.vue),
[Push configuration](client/src/components/settings/SettingsPush.vue),
[browser subscriptions](client/src/services/pushNotifications.js).

## Automation and feed operations

### Action and Action condition

An ordered crawl-time rule for incoming Articles. Conditions support literal
phrases or advanced regular expressions. Types include discard, save, mark read,
mark original opened, mark advertisement, mark low quality, and assign tag.
**Discard** hides an Article from normal queries; it is separate from cleanup
deletion. Advertisement/low-quality Actions explicitly override a component to
0. Changes to the ordered collection remain drafts until saved.

### Feed item filter

A Feed-level inclusion/exclusion regular expression with optional `title`,
`content`, `url`, `author`, or `category` field selection and leading `!` negation.
For example, `!title:/advertorial/i` excludes matching titles. It is separate
from saved-search expressions and post-match Actions.

### Webhook and Generated Feed

A **Webhook** sends matching Articles to an external endpoint; field/operator
conditions use **ALL** or **ANY** matching, with a signing-secret control.
A **Generated Feed** exposes a saved Article expression as RSS through a private
shareable URL. It uses Smart Folder expression syntax but is an outbound result,
not an incoming subscription or an HTML/XPath Feed.

### HTML/XPath Feed and OPML

An **HTML/XPath Feed** extracts items from a web page using configured XPath
selectors for item boundaries, title, URL, content, and optional metadata.
Preview checks extraction before saving. **OPML** is the subscription interchange
format used to import/export Feed and Category hierarchy; import preview is
separate from committing the import.

### Crawl, refresh, update interval, and background refresh

A **crawl** fetches/processes subscribed feed items. **Update interval** controls
automatic scheduling, including adaptive publisher-activity scheduling or
manual-only. **Fetch new articles** starts crawling and displays streamed progress.
**Reload articles** reloads stored Article results and overview counts without
crawling publishers.
**Background refresh** is Electron's profile-wide scheduling facility, managed
through Desktop settings rather than Article preferences.

### Feed health, refresh history, and Cleanup

**Feed health** describes fetch/processing reliability and failures, separate
from source trust. **Refresh history** summarizes completed/failed user-triggered
crawls, including new/updated Article totals. **Cleanup** permanently deletes retained
Articles under age/count limits and unread/saved/opened protections. Count limits
take priority over age, and protected Articles can leave counts above a limit.
Cleanup does not create a recoverable archive; internal archiving configuration
and API names describe this deletion policy.

Evidence: [Actions](client/src/components/settings/SettingsActions.vue),
[phrase conditions](client/src/services/actionConditions.js),
[item filters](client/src/services/itemFilterValidation.js),
[Webhook conditions](client/src/services/webhookConditions.js),
[Webhooks](client/src/components/settings/SettingsWebhooks.vue),
[Generated Feeds](client/src/components/settings/SettingsGeneratedFeeds.vue),
[HTML/XPath extraction](client/src/components/dialogs/feeds/HtmlXpathFeed.vue),
[OPML import](client/src/mixins/opmlImportFlow.js),
[Feed configuration](client/src/components/dialogs/feeds/UpdateFeed.vue),
[Desktop settings](client/src/components/settings/SettingsDesktopBackground.vue),
[operational sections](client/src/components/settings/README.md),
[Cleanup](client/src/components/dialogs/Cleanup.vue).

## Offline reading, account, and processing

### Offline profile, downloaded snapshot, and synchronization

An **offline profile** belongs to this device/browser and account, scoped by API
origin and user ID. Its **downloaded snapshot** contains a bounded recent Article
collection prepared while connected; replacing it activates a complete new
generation. **Update offline downloads** replaces this stored-article snapshot
without crawling publisher feeds. Disabling future updates retains existing
downloads.
**Synchronization** sends queued read/unread and save/unsave assignments and
reconciles accepted server state. Pending and failed assignments remain distinct
from downloaded content and the last successful synchronization.

### Unsynchronized intent and clear downloads

Unsynchronized intent is a queued state assignment, not a replay of reading
observations or all Article actions. **Clear downloaded articles** removes the
current account's profile/content while preserving pending intent.
**Discard unsynchronized changes** is a separate action that cannot undo effects
already accepted by the server. Offline reading does not supply live search,
rankings, observations, or external media.

### Account, role, and authentication

Account state identifies the signed-in user and separates user preferences/data
from administrator-only server configuration. Roles include `user` and `admin`.
**Local authentication** uses RSSMonster credentials; **provider sign-in** uses
OpenID Connect (OIDC). Linking a provider, provisioning an account, email
verification, password replacement, and deleting an account are separate flows.

### Inference, capabilities, and assistant

**AI / Inference** is the deployment connection serving optional embeddings,
generation, classification, and assistant capabilities. Feature flags/capability
status control client availability. **Classification** supplies Article scores;
**generation** supplies summaries and inferred tags in combined Article analysis,
as well as generated presentation labels. **Embeddings** support semantic
relationships. Local models and compatible remote providers are supported;
OpenAI is not required. The **assistant** is the optional question/chat surface,
separate from ordinary search and Smart Folder expressions.

### Draft, saved settings, environment defaults, and effective configuration

A **draft** is a local edit awaiting a successful save. **Reset to defaults** can
reset only that draft; it does not universally persist immediately.
Administrator **environment overrides** replace deployment defaults with saved
server configuration. **Restore environment defaults** removes those overrides.
**Effective configuration** is the server-reported configuration currently in
force. Inference **Test connection** probes the draft without saving, whereas
**Refresh** checks the saved connection.

### Article analysis, processing jobs, and semantic labels

Article analysis states include `pending`, `processing`, `complete`, `skipped`,
and `failed`. Pending, processing and failed states suppress unusable inferred
scores, summaries and inferred tags for the current version; manual/rule tags
remain separate. Skipped analysis can retain default scores, so unavailable
analysis and neutral fallback values are not interchangeable. **AI Processing**
presents the server's background queue health as healthy, busy, degraded, or stalled, with
user-facing job labels **Article analysis** and **Semantic labels**.
**Awaiting recovery** means unfinished analysis without an active job.
Retrying failed jobs and clearing completed/dead history are distinct operations.

### Health & errors, failure group, and occurrence

**Health & errors** (`SettingsObservability.vue`) combines current service-health
checks with the user's processing-failure inbox. Health checks are separate from
the failure filters and historical occurrences.
A **failure group** combines abnormal outcomes by stable fingerprint; an
**occurrence** is one captured failure with identifiers, stage, message, retry
state, stack/context, and time. These failure occurrences are not news Events.
Clearing failure records is separate from clearing processing-job history.

Evidence: [Offline snapshots](client/src/services/offlineReading.js),
[state assignments](client/src/services/articleStateActions.js),
[offline Settings contract](client/src/components/settings/README.md#offline-reading),
[account controls](client/src/components/settings/SettingsAccount.vue),
[OIDC configuration](client/src/components/settings/SettingsOidc.vue),
[Inference capabilities](client/src/components/settings/SettingsInference.vue),
[inference orchestration](inference/README.md#local-models),
[runtime overrides](client/src/components/settings/SettingsInferenceRuntime.vue),
[assistant](client/src/components/assistant/ChatAssistant.vue),
[analysis presentation](client/src/services/articleAnalysisPresentation.js),
[analysis status contract](server/models/article.js),
[queue operations](client/src/components/settings/SettingsProcessingJobs.vue),
[failure inspection](client/src/components/settings/SettingsObservability.vue).
