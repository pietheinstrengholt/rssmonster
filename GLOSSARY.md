# Domain glossary

This glossary records domain language and confirmed decisions grounded in the
code and documentation. Use the linked sources for implementation details.
Coverage includes server domain concepts and externally meaningful operational contracts, rather than every model
field or implementation helper.

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

### Unfiltered canonical Article selection

`unfilteredCanonicalArticleWhere()` selects Articles with no duplicate pointer and
`filteredInd = false`. Canonical identity alone does not require an Article to be
unfiltered. This shared predicate does not establish ownership or complete
visibility: callers add `userId`, legacy duplicate-status exclusions where required,
and query-specific eligibility rules. See
[selection predicate](server/services/duplicates/articleDuplicates.js) and
[search eligibility](server/services/articleSearch/README.md#article-eligibility).

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
evidence is pulled toward the neutral prior 0.75. Ranking uses the same prior
when trust is unavailable, while preserving finite estimated values, including zero. It differs from fetch reliability, personal
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

### Feed state

Stored subscription state (`Feed.status`): `active`, `error`, or `disabled`, with
failure history and possible muting or backoff. An unchanged response is successful. Retrieval reliability differs
from FeedTrust. See [Crawling](docs/crawling.md) and [Feed model](server/models/feed.js).

### Feed overview health

The derived current condition displayed in the Feed overview: `NEW`, `HEALTHY`,
`RECOVERED`, `DEGRADED`, `FAILING`, or `DISABLED`. It combines Feed state and recent
reliability history, independently of FeedTrust. Recovered overview health means
the source is currently operational and its latest crawl required recovery,
subject to reliability rules. It is separate from the result of a single attempt.
See [health derivation](server/services/feeds/feedOverviewHealth.js) and
[Feed terminology](docs/feeds-and-categories.md).

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

## Additional server contracts

### Feed URL identity, alias, and reconciliation

Feed URL identity is a conservative HTTP(S) comparison key, separate from the
fetch URL and Article URL normalization. It removes fragments and normalizes safe
percent escapes; it does not apply Article tracking-parameter removal. A Feed URL
alias preserves a user-scoped historical endpoint identity. Feed reconciliation
transactionally converges subscriptions discovered to represent the same Feed,
including their Articles and aliases. This differs from Article duplicate suppression.
See [Feed identity](server/services/feeds/feedUrlIdentity.js),
[aliases](server/services/feeds/feedUrlAliases.js), and
[reconciliation](server/services/feeds/feedReconciliation.js).

### Publisher self URL

A publisher-declared Feed endpoint, validated before becoming trusted Feed identity
or a promoted fetch URL. Declaration alone does not authorize endpoint replacement.
This is Feed identity evidence, separate from an entry's GUID or Article URL.
See [self-identity validation](server/services/feeds/feedSelfIdentity.js).

### Fetch outcome and Feed crawl result

A fetch outcome describes acquisition: `changed`, `unchanged`, `not_modified`,
`rate_limited`, `transient_failure`, `permanent_failure`, `malformed`,
`security_rejected`, `too_large`, or `timed_out`. A Feed crawl result records the
final per-Feed outcome within a crawl run: `SUCCESS`, `RECOVERED`, or `FAILED`,
with timing, recovery diagnostics, and entry-processing counts. Successful retrieval
need not insert Articles. These statuses differ from Feed state, Feed overview health, and job status.
See [fetch contract](server/services/feeds/http/contracts.js) and
[crawl result model](server/models/feedCrawlResult.js).

### Conditional fetch, refresh schedule, and backoff

Conditional fetch uses accepted ETag/Last-Modified validators; HTTP 304 and an
unchanged response-body hash avoid repeated entry processing. Scheduling combines
adaptive activity or a manual interval with publisher cache freshness, Retry-After,
failure backoff, and stable per-Feed jitter. A zero manual interval disables scheduled
refresh. Fetch-body hashes differ from Article source/text hashes; publisher cache
freshness differs from Article freshness used in ranking.
See [acquisition and scheduling](server/services/feeds/README.md).

### Content kind

Adapter metadata distinguishing literal text from HTML for the selected body and
description. Known content kind controls normalization; text resembling markup
must not be interpreted as HTML merely because of its appearance.
See [content-kind contract](server/services/crawl/content/README.md#content-kind-contract).

### Embedding-space compatibility

Semantic comparison requires matching nonempty model identifiers and compatible
vector dimensions. Equal dimensions alone do not establish a shared coordinate
system. Missing or incompatible provenance supplies no semantic match; it does not
remove an otherwise eligible Article from Recommended.
See [vector compatibility](server/services/vectors/embeddingModel.js).

### Island taxonomy

A shared vocabulary of interest concepts, with identity, display/category names,
optional model-qualified vectors, and active/hidden/archived status. Compatible
semantic matches can supply Island names. Taxonomy entries are not user-owned
Interest Islands and do not establish personal preference.
See [taxonomy model](server/models/islandTaxonomy.js) and
[name resolution](server/services/islands/islandVectorUtils.js).

### Island support and behavioral snapshot

Support Article IDs are bounded retrieval hints for current behavioral evidence,
rather than Event-style membership. Ownership, visibility, behavior timestamps,
and compatible similarity must still be checked. Calibration snapshots and audit
history record already-used evidence; they must not become additional interactions
on replay. See [support](server/services/islands/islandSupport.js) and
[calibration replay](server/services/jobs/README.md#conservative-scoping-and-replay).

### Generated semantic label

Optional presentation text for an Event or Island derived from bounded Article-title
context. Labels explain persisted relationships; they are not independent membership,
interest, or ranking evidence. See
[label generation](server/services/semanticLabels/semanticLabeling.js).

### Offline Article state action and receipt

An authenticated, ordered explicit read/unread or favorite assignment carrying a
client UUID. A per-user receipt makes replay idempotent and survives Article deletion.
Reusing an ID with different action content is rejected. Each action commits
separately; a retryable failure defers later actions. Sync returns current Article
state, does not record exposure, and does not expand Event read scope.
See [sync service](server/services/articles/syncActions.js) and
[receipt model](server/models/articleSyncAction.js).

### Processing failure

An append-only abnormal processing observation recording stage, type, severity,
subject, timing, and retry context. It can describe crawl or other work and is
separate from a dead processing job or the final Feed crawl result.
See [failure model](server/models/processingFailure.js) and
[recording](server/services/observability/processingFailures.js).

### User settings and server settings

User settings store account-specific selection and behavior preferences, with
separate Sidebar, Briefing, and Archiving settings. Server settings store shared
runtime configuration overrides, including authentication, SMTP, inference, and
push configuration. Server configuration is not personal preference evidence.
See [user settings](server/models/setting.js),
[server settings](server/models/serverSetting.js), and
[runtime configuration](server/services/serverSettings.js).

### Local authentication, OIDC identity, and application session

Local authentication uses an RSSMonster password. An OIDC identity links the exact
provider issuer/subject pair to one User; email equality never merges accounts.
OIDC-only users have no local password. Both sign-in methods issue application
sessions, distinct from provider tokens and login transactions. Provider claims
and account roles are separate contracts.
See [authentication](server/services/auth/README.md).

### Assistant tool token and MCP

MCP exposes authenticated tools for RSSMonster data and operations. The Assistant
uses the same server-owned handlers through a separate, short-lived token scoped
to user, password version, audience, and allowed tools. Model arguments cannot
choose ownership. Tool credentials differ from application login sessions.
See [Assistant tool boundary](server/services/agent/README.md).

### Fever and Google Reader compatibility

External reader protocols adapting Feed/Category and Article state to client
terminology such as groups, streams, labels, and starred items. Their credentials
and response formats are protocol-specific; they still operate on the authenticated
user's library. These names do not introduce another domain Category or Favorite.
See [Fever](server/controllers/fever.js) and
[Google Reader](server/controllers/greader.js).

### Daily digest and email outbox

A daily digest is an emailed selection from the Briefing's Recommended and Top
Stories results, with bounded sections and deduplication across sections. Scheduling
and delivery deduplication use the user's configured local calendar date; sending
does not mark Articles read. The email outbox persists rendered messages before
leased delivery with bounded retries. Delivery states are `pending`, `sending`,
`sent`, `failed`, and `cancelled`; SMTP delivery is at least once.
See [digest selection](server/services/dailyBriefing/dailyBriefingEmail.service.js),
[scheduler](server/services/dailyBriefing/dailyBriefingScheduler.js), and
[email delivery](server/services/email/README.md).

### Email verification and password reset

Separate token-based account workflows: verification establishes control of an
email address; password reset recovers local credentials. Neither is Article
feedback or an OIDC identity link. Passwordless provider accounts have
provider-managed email and cannot use local-password recovery.
See [verification](server/services/email/emailVerification.js),
[reset](server/services/email/passwordReset.js), and
[account policy](server/services/auth/README.md).

### Push subscription

A user-owned browser notification endpoint with delivery keys. VAPID identifies
the application server to the push service; it is separate from the user's Feed
subscriptions. Expired endpoints are removed, and replacing VAPID keys may require
browser resubscription. See [Web Push](server/services/push/README.md).

## Resolved terminology conflicts

These notes record resolved discrepancies and the agreed current terminology.

### Resolved: FeedTrust prior and ranking fallback

The neutral prior is 0.75: the Feed model starts there, the estimator blends sparse
component evidence toward it, and ranking uses it for missing, null, or nonfinite
trust. An estimated FeedTrust value reflects source evidence blended according to
confidence; finite estimates, including zero, remain meaningful. A value equal to
the prior does not alone establish whether evidence was available.

Previously, ranking used 0.5 for missing/nonfinite trust and converted null to zero.
The ranking fallback now follows the neutral prior. See
[FeedTrust terminology](docs/feedtrust.md#evidence-confidence),
[Feed model](server/models/feed.js),
[estimator](server/scripts/calculateFeedTrust.js), and
[ranking fallback](server/services/articles/articleQuality.js).
