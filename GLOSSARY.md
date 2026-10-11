# Domain glossary

This glossary records domain language and confirmed decisions grounded in the
code and documentation. Use the linked sources for implementation details.

## Confirmed domain decisions

### Events and Interest Islands are separate relationships

An Event groups Articles covering one real-world occurrence. An Interest Island
represents a user's recurring signed preference learned from Article behavior.
Articles match Islands directly, including Articles without an Event. Event
membership is not required for Island formation or personal interest scoring.
The crawl's Event-before-Island-scoring execution order does not make Events an
intermediate personalization layer. See [Events](docs/events.md),
[Interest Islands](docs/interest-islands.md), and
[semantic contract](docs/architecture/semantic-system-contract.md#interest-islands).

### Read state and reading evidence are separate

Read/unread tracks an Article's state in the reading queue. Manual, automatic,
bulk, and grouped-Event read actions do not by themselves establish engagement
or personal preference. `readAt` records state timing; `firstSeen` records exposure.
Neither is independent positive or negative preference evidence.
Observed deep reads, outbound clicks, favorites, and explicit feedback supply
their own behavioral evidence. Marking unread does not itself mean dislike.
See [reading behavior](docs/marking-articles-read.md),
[Article fields](server/models/article.js), and
[semantic contract](docs/architecture/semantic-system-contract.md#interest-islands).

### Article quality, source trust, and personal interest are separate

Overall article quality describes an Article's content; FeedTrust describes recent
source value in the owner's account; personal interest describes signed subject
relevance to that user. A high-quality Article can come from an inconsistent
source or cover a subject the user dislikes.

Overall article quality badges and quality thresholds use Article content only, without
FeedTrust or personal interest. **Quality & source trust** ranking combines
70% articleQuality and 30% FeedTrust. Recommended combines this source-aware
ranking signal with personal interest, freshness, Event corroboration, and
existing rule/Hot boosts. Combining signals for ranking does not merge their
meanings or change the Article-only quality threshold.
See [Scoring](docs/scoring.md), [FeedTrust](docs/feedtrust.md), and
[quality implementation](server/services/articles/articleQuality.js).

## Assistant

RSSMonster's conversational agent for retrieving user-owned RSS data and invoking
explicitly requested actions. Inference owns its agent loop and model calls;
the application server owns authenticated database tools and chat presentation.
See [assistant orchestration](docs/inference.md#assistant-orchestration-and-database-tools).

## Bulk read

An explicit operation that marks unread, owned, canonical Articles as read using
selected article IDs, a supplied list snapshot, or a matching query. An empty
snapshot selects nothing. Event grouping can include canonical unread siblings of
selected Event members. Completed writes remain completed if a later write fails.

See [manual and bulk actions](docs/marking-articles-read.md#manual-and-bulk-actions).

## Library and organization

### User and ownership

The account owning subscriptions, Articles, preferences, Events, Interest Islands,
and automation. Direct results and related records must respect ownership;
semantic relationships do not grant access to another library.
See [models and associations](server/models/index.js).

### Feed (subscription)

A user-owned source fetched for entries, with its own Category, source configuration,
crawl schedule, health, and intelligent-feature switches. It differs from an Article
and a Generated Feed. See [Feeds and Categories](docs/feeds-and-categories.md)
and [Feed model](server/models/feed.js).

### Feed entry and Article

A Feed entry is an adapter's extracted item before acceptance and persistence.
An Article is the stored, user-owned record with source metadata, content,
reading state, and derived signals. Repeated entries can revise existing Articles;
rejected entries need not create records. Articles may remain eventless or unmatched
to Islands. See [Concepts](docs/concepts.md) and [Article model](server/models/article.js).

### Category

A user-defined organization of Feed subscriptions. Publisher item categories become
provider Tags, rather than the user's subscription Categories.
See [Categories](docs/categories.md) and [Tags](docs/tag.md).

### Tag and tag provenance

A normalized article label assigned to one Article. `tagType` records `manual`,
`provider`, `feed`, `rule`, or `inferred` provenance. Names are trimmed and lowercased;
matching names on different Articles have separate assignment IDs. Manual tags
survive automatic reconciliation; optional enrichment replaces only inferred tags.
See [Tags](docs/tag.md) and [tag persistence](server/services/crawl/persistence/tags.js).

### Search expression and Smart Folder

Search expressions combine text intent, structured filters, dates, sorting, and
limits. A Smart Folder saves an expression evaluated against the current library;
it does not move or copy Articles. Relative dates remain dynamic. This language
differs from Action and Feed item filter regular expressions.
See [Search](docs/search.md) and [Smart Folders](docs/smart-folders.md).

### Generated Feed

A saved expression exposed as request-time RSS through a private bearer-token URL.
Results remain owner-scoped and contain at most 50 Articles; this does not create
another subscription or copy the result set. See [Generated Feeds](docs/generated-feeds.md).

### OPML

The subscription import/export format used to transfer feeds and their organization.
An OPML export does not back up Article content or reading state.
See [OPML](docs/opml.md).

## Identity, revisions, and content

### Publisher identity

Evidence that an entry is the same publisher entry as a stored Article, such as a
stable GUID/Atom ID or suitable feed-scoped URL identity. Resolution includes
filtered records and precedes duplicate suppression.
See [identity boundary](server/services/crawl/identity/README.md).

### Normalized URL

A comparison form removing tracking and superficial URL variation while retaining
meaningful query parameters. It supports identity, duplicate matching, and Hot-link
reconciliation. See [normalization](server/services/crawl/content/normalizeUrl.js).

### Article revision and derivation repair

A revision updates an existing Article after a publisher content change while
preserving user state, including read status, favorites, clicks, and manual tags.
A metadata correction or derivation repair is not automatically a revision.
Derivation repair changes extracted representations, for example when visible-text
extraction improves but the source hash is unchanged.
See [revision handling](server/services/crawl/persistence/updateArticle.js).

### Canonical Article

The record representing content rather than pointing to another record through
`duplicateOfArticleId`. Canonical status alone does not establish visibility:
filtering, ownership, and selection constraints still apply.
See [Article model](server/models/article.js).

### Duplicate and duplicate suppression

Another record representing already-covered content, linked to a canonical Article.
Deterministic matching uses identity/URL and content evidence. Filtered records
remain identity candidates but are excluded from content/title suppression.
Duplicate suppression differs from Event grouping.
See [duplicate matching](server/services/crawl/identity/README.md).

### Semantic duplicate detection

A post-embedding duplicate-checking stage separate from ingestion identity checks
and Event assignment. Semantic similarity alone does not make all related coverage
duplicate content. See [embedding pipeline](docs/article-embedding.md) and
[post-crawl processing](server/services/crawl/orchestration/postCrawlSemanticPipeline.js).

### Content representations and hashes

These fields have separate contracts:

| Field | Meaning |
| --- | --- |
| `contentOriginal` | Selected publisher body preserved as source data; omitted from Article API JSON. |
| `contentHtml` | Cleaned, URL-normalized, sanitized reading HTML. |
| `contentText` | Canonical visible text derived from sanitized reading HTML. |
| `description` | Selected raw publisher description, not display-safe HTML. |
| `descriptionHtml` / `descriptionText` | Sanitized description HTML and its visible text. |
| `contentStripped` | Historical representation, not a universal substitute for the current fields. |
| `contentSourceHash` | Publisher source fingerprint, used for source comparisons. |
| `contentTextHash` | Canonical visible-text fingerprint, used for text comparisons. |

Description-only entries can supply the reading body through sanitized derivatives.
Source and text hashes provide different duplicate/revision evidence, including
recognizing derivation repairs. See [content contract](server/services/crawl/content/README.md)
and [Concepts](docs/concepts.md).

### Structured media and lead image

Structured media describes supported audio, video, images, or galleries extracted
from attachments and inline markup. A lead image is the selected image used for
Article presentation. Media normalization and image selection have distinct roles.
See [media processing](server/services/crawl/media/README.md).

## Selection, reading, and feedback

### Article eligibility and visibility

Eligibility decides whether an Article qualifies under ownership, canonical
visibility, source scope, state, query, and score gates. Ranking cannot restore
an ineligible Article. Stored-record counts can exceed visible or grouped counts.
See [Article Search](server/services/articleSearch/README.md#article-eligibility).

### Filtered Article and Feed item filter

A filtered Article remains stored with `filteredInd` after an Action discards it,
excluded from normal user and semantic queries. A Feed item filter instead rejects
future entries before identity lookup and persistence using one optionally negated
or field-scoped regular expression. Changing it does not alter stored Articles.
See [Actions](docs/actions.md) and [Filtering Feed Items](docs/feed-item-filters.md).

### Score threshold (quality gate)

A minimum score excluding Articles from a selection, separate from ordering.
Overall article quality and component thresholds are distinct and cumulative. Pending,
processing, or failed analysis is exempt from inferred-score rejection; explicit
Action score overrides retain their threshold behavior.
See [Scoring](docs/scoring.md) and [architecture](docs/how-rssmonster-works.md).

### Read state

Read/unread status changed manually, automatically, or through integrations.
`readAt` records a transition, not proof of reading. Read-state toggles alone do not
request personalization recalibration or supply preference evidence, including
bulk and grouped-Event read actions. Unread state does not imply dislike.
See [Marking Articles Read](docs/marking-articles-read.md)
and [personalization jobs](server/services/jobs/README.md).

### Exposure (seen / firstSeen)

`firstSeen` records the first time an Article appeared on screen. This confirmed
meaning is distinct from fetching or ingestion, publication, insertion, read state,
and sustained reading. Once set, it is preserved, including after marking unread.
Legacy mark-read calls can also populate it, so historical values do not guarantee
observed exposure. See [Article model](server/models/article.js) and
[search time concepts](server/services/articleSearch/README.md#time-concepts).

### Attention and deep read

Attention estimates eligible time with readable content through `attentionBucket`.
A bucket of at least three supplies deep-read evidence; `lastMeaningfulReadAt`
records qualifying observations. Visibility and idle rules apply; marking read
alone does not create this evidence. See [reading behavior](docs/marking-articles-read.md)
and [Article model](server/models/article.js).

### Outbound click

A recorded click following an Article's outgoing link, separate from opening
content internally. Click count and `lastClickedAt` supply behavioral evidence;
opening Reader mode is not an outbound click. See [Article model](server/models/article.js).

### Favorite (bookmark / starred)

An explicitly saved Article represented by `favoriteInd`; these labels describe
one conceptual state, including compatibility-client terminology. Favorites can
protect Articles from cleanup and contribute preference evidence.
See [Bookmarks](docs/bookmarks.md).

### Explicit feedback

**More like this** and **Not interested** express positive and negative personal
preference with their own aging timestamps. They differ from read state, source
quality judgments, and favorites. See [Interest Islands](docs/interest-islands.md).

### Event grouping and grouped read

One selected Article represents each Event while standalone Articles and underlying
coverage remain available. A read with `grouping = event` marks currently linked
unread canonical Event members read; `grouping = none` changes only the selected
Article. See [Event behavior](server/services/events/README.md).

## Semantic relationships and personalization

### Article embedding

A model-generated numeric representation stored as `articleVector` with its model
identifier. It supports semantic comparison without changing or summarizing source
text. See [Article Embedding](docs/article-embedding.md).

### Event

A user-owned group covering one concrete occurrence, supported by multiple eligible
Articles. Unique or ambiguous Articles may remain eventless. Events differ from
recurring preferences and duplicate identity.
See [Events](docs/events.md) and [invariants](server/services/events/README.md).

### Representative Article and Developing Article

`representativeArticleId` is the stable Event anchor preserved during normal
incremental assignment. `developingArticleId` presents newer coverage after an
Event has been consumed. A valid unread developing pointer remains sticky as more
coverage arrives. Reading does not clear it; later eligible coverage can begin
another developing wave. See [Event pointers](server/services/events/README.md).

### Event reconciliation

Repair of Event membership, pointers, counts, vectors, and coverage evidence after
eligibility changes. Events with fewer than two eligible members dissolve without
deleting surviving Articles or their reading state.
See [Event invariants](server/services/events/README.md).

### Interest Island (Island)

A private semantic preference learned from canonical Article behavior. Its aggregate
vector describes an interest area; signed weight promotes or penalizes related
content. An Island can have singleton support, whereas an Event requires
corroborating membership. See [Interest Islands](docs/interest-islands.md).

Formation uses Article behavior, and candidate Articles match Islands directly;
neither relationship requires Event membership.

### Island calibration

Formation of behavioral profiles, matching to existing Islands, and updates to
vectors, weights, evidence, lifecycle, and capacity. It differs from scoring
candidate Articles against resulting Islands. See [Interest Islands](docs/interest-islands.md).

### Island weight and confidence

Weight is signed preference strength. Island confidence describes support for the
preference; relationship confidence describes how strongly a candidate relates to
it. Similarity, confidence, and strength have separate roles, and none is Article
quality. See [interest reference](server/services/islands/README.md#confidence-aware-interest).

### Personal interest (interestScore)

A bounded signed relevance contribution from Island relationships and explicit
behavioral fallback. Positive values promote; negative values penalize; missing
evidence is neutral. Sparse personalization is valid even when all eligible
Articles receive Recommended scores. See [Scoring](docs/scoring.md).

### Explicit behavioral fallback

A scoring path preserving qualifying likes, favorites, and dislikes inadequately
represented by Island evidence. Recency, intent, and path deduplication bound its
contribution. See [personal interest](docs/scoring.md#personal-interest).

### Personalization refresh

Durable work recalibrating a user's Islands and rescoring eligible unread Articles
after qualifying behavior or elapsed time. Explicit feedback also has a faster
related-candidate refresh that does not rebuild Islands. Results appear on fetches
after worker completion. See [refresh jobs](server/services/jobs/README.md).

### Muted and archived Island

Muting excludes an Island from scoring without changing lifecycle or evidence.
Archiving excludes it through lifecycle management. Both differ from deleting
Articles through retention cleanup. See [Island model](server/models/island.js).

## Quality, trust, and ranking

### Overall article quality (articleQuality)

Article-only quality: 50% stored quality, 25% sentiment, and 25% advertising.
Component inputs use 0–100; missing/nonfinite components use 70. The result is
clamped and normalized to 0–1, without FeedTrust.
See [quality implementation](server/services/articles/articleQuality.js).

### Advertisement score

Higher values mean less promotional content, sharing the higher-is-better direction
of quality and sentiment despite the name. See [Scoring](docs/scoring.md).

### FeedTrust (source trust)

User-specific recent source history combining Article quality, exposure-backed
engagement, deterministic originality, and explicit negative feedback. Sparse
evidence is pulled toward 0.75. It differs from fetch reliability, personal
affinity, and factual verification. See [FeedTrust](docs/feedtrust.md).

### Originality and duplication rate

Source originality evidence comes from actual duplicate links; duplication rate
measures duplicate Article history. Event co-coverage alone is not duplication
evidence or a measure of novel reporting. See [FeedTrust](docs/feedtrust.md).

### Source affinity

`Feed.sourceAffinity` estimates how consistently recent Articles match active
positive Interest Islands. It describes personal source relevance separately from
FeedTrust and health. See [Feed model](server/models/feed.js).

### Freshness

Publication-age decay, separate from exposure and ingestion timestamps.
Intelligent ranking bounds it to 0–1. See [Scoring](docs/scoring.md#freshness).

### Quality ranking (Quality & source trust)

The source-aware signal `0.70 × articleQuality + 0.30 × feedTrust`, distinct from the
Overall article quality badge and article-only threshold. See [Scoring](docs/scoring.md#quality).

### Recommended

Runtime personalized ranking combining signed interest, freshness, Quality, Event
corroboration, a rule-match boost, and a Hot boost. Every eligible Article receives
a finite score even without an Event, Island, vector, or interest match. Its signed
score is not a probability. See [Scoring](docs/scoring.md#recommended).

### Top Stories

Non-personalized ranking emphasizing current Event importance, freshness, Quality,
and Hot status rather than personal interest. See [Scoring](docs/scoring.md#top-stories).

### Coverage, source diversity, and corroboration

Coverage derives from Event member count; diversity/spread derive from distinct Feed
count; corroboration combines coverage and cross-source evidence. Separate Feeds
do not guarantee independent reporting. See [Scoring](docs/scoring.md#event-evidence).

### Hot Article and hotlink

A Hot Article is a recent canonical, unfiltered Article targeted by qualifying
recent cross-Feed link observations in the same account. A hotlink is a collected
outbound-link observation, not a user click. After reconciliation, `hotlinks` counts
qualifying incoming observations and `hotInd` marks a nonzero count. Hot status
differs from quality and semantic similarity. See [Hot Articles](docs/hot-articles.md).

### Daily Briefing

A saved-preference collection of recent Articles with an Event-based overview.
Period, unread, Hot, interest, developing-coverage, and source-count controls affect
selection. The overview uses stored text rather than generating a new model summary
on every visit. See [Daily Briefing](docs/daily-briefing.md).

## Ingestion, automation, and operations

### Crawl and crawl run

A crawl fetches due subscriptions and processes accepted new or revised entries.
A crawl run records a user's invocation and progress/outcome. Ownership heartbeats
and active-run protection support recovery. `nextFetchAt` is Feed scheduling
authority. See [Crawling](docs/crawling.md).

### Feed health

Fetch state: active, error, or disabled, with failure history and possible muting
or backoff. An unchanged response is successful. Retrieval reliability differs
from FeedTrust. See [Crawling](docs/crawling.md) and [Feed model](server/models/feed.js).

### Initial import and ongoing admission window

Initial import retains the selected history range until completion. Later unseen
entries must satisfy the Feed's ongoing admission window and the user's maximum-age
limit. Existing Articles can still receive revisions. See [Archiving](docs/archiving.md).

### HTML + XPath Feed

A webpage subscription whose XPath rules extract entries from returned HTML into
the normal Article pipeline. Extraction does not execute page JavaScript.
See [HTML + XPath Feeds](docs/html-xpath-feeds.md).

### Action

A user-owned regular-expression rule evaluated during crawling to tag, favorite,
change state, override scores, or discard Articles. It requires no AI and differs
from search expressions and webhook conditions. See [Actions](docs/actions.md).

### Official Source

A configured organization/domain match labeling Article URLs as official coverage.
It identifies a configured source rather than verifying claims or assigning
FeedTrust. See [Official Feeds](docs/official-feeds.md).

### Webhook and webhook delivery

A webhook matches newly inserted accepted Articles against configured conditions.
A delivery is the queued outbound `article.matched` notification sent by its worker.
Revisions do not replay old Articles; retries can send the same delivery ID again.
See [Webhooks](docs/webhooks.md).

### Inference and AI enrichment

Inference supplies embeddings, analysis, generated text, and Assistant orchestration.
Optional enrichment adds summaries, inferred tags/scores, and presentation labels
after persistence, separately from the ordered embedding → Event → Island-scoring
path. See [Inference](docs/inference.md) and [architecture](docs/how-rssmonster-works.md).

### Article analysis state

`pending`, `processing`, `complete`, `skipped`, or `failed` describes analysis
availability independently of reading state and job status. Unfinished analysis
does not make an Article unreadable. See [Article model](server/models/article.js).

### Processing job and dead job

Durable owner-scoped work with deduplication, version guards, priority, retries,
and leases. States are `pending`, `running`, `succeeded`, `dead`, or `cancelled`.
Dead means terminal failure or exhausted attempts; succeeded can include safely
obsolete work. See [queue](docs/crawling.md#durable-optional-processing-queue).

### Lease and crawl-priority lease

An expiring, renewable database claim protecting active work. Feed/job leases
protect their writes; crawl-priority leases pause new optional AI claims during
critical semantic processing while allowing running work to finish.
See [Crawling](docs/crawling.md).

### Worker

A process with a defined background responsibility: crawl workers schedule retrieval
and ordered semantic work; AI workers consume processing jobs; webhook workers send
deliveries. Deployment and capability settings determine which processes run.
See [architecture](docs/how-rssmonster-works.md).

### Archiving (article cleanup / retention)

Permanent deletion of eligible Article records under the owner's age/count limits
and unread/favorite/click protections. It does not move Articles to another archive
or remove subscriptions. Stored-record limits differ from visible navigation
counts. See [Archiving](docs/archiving.md).
