# Crawl Architecture

Crawl is the subsystem responsible for keeping RSSMonster's article library current, clean, and trustworthy. It converts external RSS and Atom entries into local articles while preserving user intent, preventing duplicate noise, updating revised articles, and preparing new content for downstream processing.

This document describes the architectural contract of Crawl. It intentionally focuses on behaviour rather than its exact implementation.

---

# Architectural Objective

A crawl run represents the ingestion contract between external feeds and the RSSMonster article library.

The crawler is responsible for:

- Refreshing feeds for one or more users.
- Determining whether an entry should enter the library.
- Detecting whether an entry is a revision of an existing article.
- Preventing duplicate articles from being created.
- Normalizing unsafe publisher content.
- Applying user-defined rules.
- Enriching newly created and meaningfully revised articles.
- Reporting progress.

The crawler owns the transition from an external feed entry to a local article.

---

# Core Principles

## User scoped

Every persisted article belongs to exactly one user.

Identity matching, duplicate detection, tags, actions, hotlinks and enrichment are always evaluated within the correct user scope.

---

## Idempotent

Refreshing the same feed repeatedly should never create duplicate reading work.

Repeated crawl executions should either:

- update an existing article,
- ignore an already known duplicate,
- or create a genuinely new article.

---

## Publisher identity first

Whenever a publisher exposes a stable identity, RSSMonster trusts it.

Stable identities include:

- Atom `<id>`
- RSS `<guid>`
- normalized article URLs

Publisher identity is used to detect revisions of the same article.

Duplicate detection is **not** responsible for deciding whether two feed entries represent the same published article.

---

## Duplicate detection is separate from identity

Article identity and duplicate detection solve different problems.

Article identity answers:

> "Is this the same feed entry I have already stored?"

Duplicate detection answers:

> "Does another article already represent this information?"

Identity matching always happens before duplicate detection.

---

## Preserve content

RSSMonster preserves enough publisher information to support:

- pleasant reading
- searching
- duplicate detection
- embeddings
- AI analysis
- language detection

The selected feed body is retained verbatim as `contentOriginal`. Publisher compatibility,
cleanup, URL rewriting, and sanitization operate only on derived content.

---

## Safe by default

All external HTML is treated as untrusted.

Stored article bodies must be suitable for safe rendering.

---

# Feed Processing Engine

## Neutral acquisition contract

Feed acquisition uses one HTTP-client-independent execution contract from discovery through
article processing. The crawl boundary creates one absolute `deadlineAt` and `AbortSignal`; every
redirect, discovery request, YouTube lookup, bounded body read, parse operation, and article
operation must propagate that same execution context. Nested operations must use the remaining
time and must never start a fresh relative timeout that could extend the original deadline.

HTTP transport details remain inside the transport adapter. Discovery and crawl orchestration
consume neutral responses and stable feed outcomes rather than Fetch API, Undici, stream, or
worker-specific errors. The closed outcome set is:

- `changed`
- `unchanged`
- `not_modified`
- `rate_limited`
- `transient_failure`
- `permanent_failure`
- `malformed`
- `security_rejected`
- `too_large`
- `timed_out`

Feed state, scheduling, leases, and crawl orchestration must consume these outcomes and must not
branch on transport-library exception classes.

Console reporting uses a separate stable operational taxonomy and emits exactly one terminal
`[CRAWL]` result for each attempted feed plus one compact batch summary. Successful recovery,
timeouts, HTTP failures, rate limiting, missing endpoints, redirect loops, network failures,
invalid or malformed feeds, validation failures, empty feeds, security rejection, and size limits
must remain distinguishable without changing scheduling outcomes. Candidate URLs, retries,
discovery details, and raw recovery diagnostics are logged only when
`CRAWL_VERBOSE_LOGGING=true`.

Conditional requests use only validators from previously accepted representations. A `304` is a
successful unchanged fetch and skips parsing and article processing. A `200` response is hashed
before parsing; an unchanged accepted representation also skips parsing. New validators are not
committed until the response is accepted as a valid feed, so malformed content cannot make an
unusable validator authoritative.

Discovery is exceptional recovery rather than routine endpoint brute force. A direct rate limit,
timeout, transient network failure, security rejection, oversized response, or non-missing HTTP
error stops without probing alternate paths. A missing stored endpoint may fetch the origin
homepage once, inspect declared RSS, Atom, and JSON Feed links, then try only the small maintained
set of conventional feed paths. Successful recovery promotes `Feed.url`, so later crawls start at
the accepted endpoint.

## Bounded bodies and byte-aware decoding

Response bodies are consumed exactly once into an application-owned neutral byte buffer. They are
read incrementally and bounded by both streamed bytes and decoded UTF-8 bytes. A valid
`Content-Length` is checked before reading when available, but missing, malformed, compressed,
chunked, or dishonest length headers never bypass the streaming limit. Exceeding the limit or
deadline must abort the request and cancel the outstanding response body.

Feed decoding uses deterministic charset precedence:

1. Byte-order marker.
2. A supported HTTP `Content-Type` charset.
3. The XML declaration encoding.
4. A detectable UTF-16 byte pattern.
5. Strict UTF-8.

Supported encodings are UTF-8, UTF-16LE, UTF-16BE, ISO-8859-1, and Windows-1252. Unsupported
charsets and invalid Unicode byte sequences fail as `malformed`; they must not silently introduce
replacement characters. Existing callers may consume compatible `bodyText`, but transport and
parser boundaries should prefer the neutral body-content contract containing bytes, decoded text,
charset metadata, and the raw-content hash.

## Feed parsing and conservative XML cleanup

JSON Feed is identified before XML cleanup and its decoded source text is passed through unchanged.
XML cleanup applies only to plausible RSS, Atom, or RDF sources. It may remove a BOM, harmless
warning text before the first plausible feed root, illegal XML characters, known HTML named
entities outside protected regions, and a harmless DOCTYPE declaration.

Cleanup must preserve CDATA, comments, processing instructions, and legitimate article content.
It must not turn structural HTML into a feed. Internal entity declarations, external entities, and
entity-expansion payloads are rejected without resolution; broad regex-based XML repair is not
allowed.

Synchronous feed parsing runs in a worker thread so CPU-bound parser work can be terminated. The
worker receives the remaining absolute deadline, has its own configurable CPU timeout, and uses a
configurable memory limit where Node.js supports worker resource limits. A parser timeout is not
complete until the worker has been terminated cleanly.

Parsed feeds are rejected before enrichment when they exceed the configured entry count or UTF-8
byte limits for an individual GUID, URL, title, author, or combined content and description.

## Feed URL identity and convergence

Feed URL identity is user-scoped and comparison-only. Normalization removes fragments, normalizes
scheme and hostname casing, IDNs, default ports, dot segments, and safe percent-encoding variants.
It preserves path and query case, meaningful query parameters, the distinction between HTTP and
HTTPS, and the presence of `www`. The normalized URL must never replace the observed fetch URL;
`Feed.url` remains the active endpoint.

Regular subscription paths check URL aliases before outbound discovery and before creating a feed.
OPML import checks known aliases but stores the declared endpoint without outbound discovery; its
first successful crawl can add verified redirect, final, and publisher-self evidence. Observed input,
discovered alternate, redirect, final, publisher-self, manual, and historical URLs are stored as
persistent aliases. A normalized alias may identify only one feed per user, and the database
constraint is the final guard against concurrent subscription races.

Redirect and discovery promotion resolves endpoint ownership before changing `Feed.url`. URL
promotion and duplicate reconciliation run transactionally, lock user/feed rows in stable order,
and return the surviving feed identity to the crawl caller. Same-user feeds that converge are
reconciled atomically; feeds from different users are never merged. The survivor preference is an
already successful feed, then the feed with more articles, then the older record, then the lower
stable ID. Aliases, articles, article tags/topics, event pointers, hotlinks, settings, user state,
feed settings, and useful fetch metadata are transferred before the losing feed is removed.
Overlapping articles are consolidated through strong publisher or URL identity without losing
non-overlapping articles.

Publisher-declared Atom `rel="self"` and JSON Feed `feed_url` values are identity evidence, not
automatic authority. Relative declarations resolve against the final accepted response URL and
must be HTTP(S), credential-free, and pass the normal SSRF safeguards. A known alias or identical
endpoint needs no extra read. Otherwise the guarded acquisition layer validates that the endpoint
parses as a feed and requires conservative same-feed evidence from endpoint/body identity,
reciprocal declarations, format, and stable recent entry identities. Cross-origin declarations
require stronger evidence, title alone is never sufficient, and rejected declarations are retained
as non-fatal diagnostics with bounded recheck caching.

## Persistent scheduling and leases

`nextFetchAt`, not legacy `lastFetched`, is the scheduling authority. Successful `200`, unchanged
content, and `304` outcomes reset consecutive failures. Every terminal outcome persists its exact
classification, diagnostic state, failure count, and next fetch time atomically.

Scheduling combines activity cadence, publisher freshness, `Retry-After`, classified failure
backoff, and deterministic non-negative feed-identity jitter. Publisher `Retry-After` is never
bounded by the activity ceiling, but hostile or accidental extreme publisher deadlines are capped
by the configurable operational limits `FEED_CACHE_FRESHNESS_MAX_MS` and
`FEED_RETRY_AFTER_MAX_MS`. SSRF rejection is a non-retryable security outcome;
malformed feeds use slower retry/quarantine behavior, while `404` and `410` use long retry
intervals.

Due feeds are claimed in indexed `nextFetchAt`, then stable feed-ID order. Claims use expiring
leases so scheduled and API-triggered crawls cannot fetch the same row concurrently. Terminal
outcomes release only the caller's owned lease, expired leases are recoverable, duplicate requests
for one canonical URL are coalesced, and per-origin concurrency and request spacing must be
preserved. Sequential crawls claim feeds just in time instead of leasing a queued batch. Active
feed work renews its lease through article processing, and feed, article, tag, and hotlink writes
must verify the current lease owner before committing.

## Execution configuration

The execution limits are configured with:

- `CRAWL_TIMEOUT_MS`
- `FEED_TIMEOUT_MS`
- `FEED_LEASE_MS`
- `FEED_RESPONSE_MAX_BYTES`
- `FEED_CACHE_FRESHNESS_MAX_MS`
- `FEED_RETRY_AFTER_MAX_MS`
- `FEED_PARSER_TIMEOUT_MS`
- `FEED_PARSER_MEMORY_MB`
- `FEED_MAX_ENTRIES`
- `FEED_MAX_GUID_BYTES`
- `FEED_MAX_URL_BYTES`
- `FEED_MAX_TITLE_BYTES`
- `FEED_MAX_AUTHOR_BYTES`
- `FEED_MAX_CONTENT_BYTES`

Deadline checks are required before and after expensive asynchronous work and immediately before
database writes. Article create, update, tag, and hotlink writes performed after the deadline must
be prevented or rolled back transactionally. Once execution expires, orchestration must not flush
queued hotlinks or convert the timeout into an ordinary per-entry error.

---

# Feed Entry Eligibility

An entry is eligible when it satisfies all required conditions.

Required:

- belongs to the current user
- is not older than `crawlSince` when a parseable publication date is available
- contains a non-empty article link
- contains either:
  - article body
  - description
  - structured media
  - lead image

On the creation path, the entry must also:

- not match an existing publisher identity that should be updated instead
- not match duplicate evidence

Expensive AI work should only happen after eligibility has been established.

---

# Processing Pipeline

The ingestion pipeline follows a fixed order.

```
Extract feed fields
        ↓
Resolve external article identity
        ↓
Extract structured media, including recognized provider iframes
        ↓
Derive compatible, cleaned, URL-normalized, sanitized HTML and visible text
        ↓
Extract description fallback, language, title, and lead image
        ↓
Update existing article by external identity
        ↓
Duplicate detection
        ↓
Apply user actions
   ├─ filter match → persist articles using filteredInd = true
   └─ accepted (filteredInd = false) → persist article and deterministic tags
        ↓
Atomically enqueue optional article_enrichment when enabled
        ↓
Persist accepted hotlink observations
        ↓
After crawl: embedding → semantic duplicates → Events → Topics → Island scoring
```

The order is intentional.

Updating existing articles happens before duplicate detection and before expensive enrichment.

---

# Article Identity

Article identity represents publisher intent.

RSSMonster supports three identity levels.

## 1. Atom ID

Preferred for Atom feeds.

```
<id>...</id>
```

---

## 2. RSS GUID

Preferred for RSS feeds.

```
<guid>...</guid>
```

---

## 3. Normalized article URL

Used only when no stable publisher identity exists.

Normalization removes fragments, known tracking parameters, and trailing path slashes while
preserving meaningful query parameters. It does not perform publisher-specific URL guessing.

---

Publisher identity is stored as:

- externalId
- externalIdType

The combination

```
userId
feedId
externalIdType
externalId
```

represents the stable identity of a feed entry.

---

# Article Updates

Once an article has been matched through its external identity, RSSMonster determines whether the publisher changed the article.

Updates compare the mutable publisher fields.

Meaningful changes include:

- title
- author
- contentText
- description
- URL
- lead image
- structured media
- publication date

If none of these changed, no database update is performed.

Important note; for the real comparison only the contentText can be used. Often the contentOriginal and contentHtml can be different but the visible text is the same, so it is not a meaningful change. This is because providers use dynamic timestamps or other non-visible content to update the HTML without changing the visible text.

Updates preserve user state such as:

- read status
- favourites
- stars
- attention
- clicks
- engagement

Publisher revisions should never reset user interaction.

Update matching is two-phase: normalized source values are classified without writing, then
source fields, affected derived fields, and crawl-owned tags are committed in one transaction.
Content, title, and description changes rerun actions and analysis; author, publication, media,
and lead-image-only changes remain source-only. URL changes rerun actions and refresh
official-source and hotlink metadata without rerunning AI analysis.

Discard action rules persist matching entries as filtered records. If a discard action rule is set, do the following:

existing article found
→ revised source matches discard rule
→ update source/read-copy fields
→ set filteredInd to true
→ skip lightweight enrichment
→ keep vector, cluster, event, topic, and island state unchanged
→ hide article from normal queries

When a later revision reruns actions and no longer matches a discard rule, set `filteredInd` back to
false and continue the normal lightweight enrichment path. Source-only revisions that do not rerun
actions preserve the existing filteredInd state.

Generated, feed, and rule tags have explicit provenance and may be reconciled during updates.
Null or unknown tag types are treated as manual and are preserved. Existing read, favorite,
click, and attention state is also preserved because action-versus-user provenance is not stored.

---

# Duplicate Detection

Duplicate detection is only executed for entries using different external identity or URLs. For instance, a feed may publish the same article with different URLs and different external IDs. Duplicate detection is not responsible for deciding whether two entries represent the same published article.

The duplicate detection is part of the semantic pipeline and is executed after the update detection. It uses the contentText and similarity cosine distance to determine whether two articles are duplicates.

Duplicate detection never updates existing articles.

---

# Content Normalization

Feed content is stored in multiple complementary forms.

## contentOriginal

The raw selected body value supplied by the feed parser, without compatibility transforms,
entity decoding, sanitization, or DOM serialization.

Used for:

- as input for update detection
- content hashing
- future reparsing

---

## contentHtml

Sanitized display HTML stored as a fragment without `html`, `head`, or `body` wrappers.

Suitable for rendering inside RSSMonster. This is what the frontend uses as input for rendering. contentOriginal is never used for rendering.

---

## contentText

Plain visible text.

Used for:

- language detection
- AI analysis
- embeddings
- search

---

When article bodies are missing, normalized description text becomes the canonical analysis text
while remaining separate feed metadata. If an otherwise valid body contains media but no visible
text, the description is appended as a plain paragraph and the complete fragment is sanitized
again before persistence.

Plain-text feed bodies preserve paragraph boundaries, are HTML-escaped, and are stored as
paragraph markup. Processing failures must also return safe display HTML; failure is never a
reason to bypass sanitization semantics.

---

# HTML Compatibility and Sanitization

Every persisted non-null `contentHtml` must pass through a single canonical processing pipeline and ultimately conform to the `sanitizeHtmlContent` security policy.

The derived HTML processing flow is:

1. Apply compatibility transforms.
2. Parse and normalize the document.
3. Recover media and responsive resources.
4. Remove unsupported and unsafe elements.
5. Normalize URLs.
6. Normalize the document into RSSMonster's canonical representation.
7. Collect outbound hotlinks.
8. Sanitize.
9. Derive visible text.

Compatibility transforms are modular and may evolve independently without changing the architectural contract.

Plain-text content follows a separate normalization path before entering the canonical content model.

---

# Content Hashes

RSSMonster maintains two different hashes.

Content hashes detect and describe publisher changes. A changed hash is not an instruction to
invalidate embeddings or rebuild semantic relationships.

## contentSourceHash

SHA-256 hash of `contentOriginal` after newline normalization and outer trimming only.

Purpose:

- as input for update detection. A change of hash indicates a publisher revision, but doesn't realy tell whether the real visible content has been changed. For that, the contentTextHash is used.
- duplicate detection
- publisher revision detection

Small publisher changes should result in a different hash.

Absent original content produces a null source hash.

---

## contentTextHash

Hash of visible plain text.

Purpose:

- duplicate detection
- publisher revision detection

Equivalent visible text should generate the same hash even if HTML differs.

Whitespace-only or absent visible text produces a null text hash; empty text must never create a
shared empty-string identity.

---

# Media

RSSMonster extracts structured media separately from article bodies.

Supported concepts include:

- video
- audio
- image galleries

Media metadata is normalized into structured JSON. Relative enclosure and Media RSS URLs resolve
against the article URL.

Recognized YouTube and Vimeo iframes are inspected before generic iframe removal. Supported
providers become structured media or inert RSSMonster-owned cards; unknown iframes are removed.

Media does not replace richer article content.

When an article primarily consists of media, structured media is sufficient for the article to be considered valid.

A valid lead image by itself is also sufficient for eligibility. Lead images remain article
metadata rather than article identity. Lead-image selection considers feed metadata, sanitized
and source HTML, descriptions, lazy attributes, and the strongest valid `srcset` candidate.

normalizeHtmlUrls owns canonical absolute URLs;
sanitizeHtmlContent owns safety.

---

# User Action Rules

User action rules execute after duplicate prevention but before persistence.

Each regular expression tests the available `contentHtml`, `contentText`, title, description, and
URL independently. Invalid regular expressions are skipped.

Rules may:

- set filteredInd to true, so articles are hidden from normal queries and skipped for AI enrichment. In the front-end this is called discard.
- mark read
- favorite
- add tags
- adjust scores

Advertisement and quality scores use higher-is-better semantics. Advertisement and bad-quality
actions therefore override their respective scores to zero.

Filtered (discarded) articles never reach article-level AI analysis. Post-crawl embedding,
duplicate, event, topic, and interest-score services must also explicitly
exclude filtered articles.

The article row and all generated, feed, and rule tags are persisted in one transaction.

Creation and publisher updates share one pure persistence mapper. Update-specific sparse-feed
policy is resolved before selecting mutable fields from that canonical mapping.

Crawler refreshes action filtering for new articles and publisher revisions.

Creating, changing, or deleting an action requires a separate bulk
reevaluation of existing articles.

---

# Analysis

Genuinely new articles enqueue durable enrichment unless AI analysis is disabled for the feed.
Existing publisher identities enqueue a versioned replacement job only when content, title, or
description changes. Source-only changes do not spend an AI call. The article and its job commit
in one transaction, so ingestion never exposes one without the other.

Classification runs only in `rssmonster-ai-worker`. Queue saturation and other
retryable inference failures leave the article available in `pending` or `processing` state and
retry with bounded backoff; they do not write default analysis as completed output. Exhausted jobs
mark only the guarded article version `failed`, without filtering it from normal reading views.
Feeds with analysis disabled retain the established fallback values with state `skipped`.

Typical enrichment includes:

- summaries
- inferred tags
- sentiment score
- advertisement score
- quality score

Handlers reload Article and Feed rows by user, read article content from the database, and recheck
the content and analysis-input hashes before and under the transactional article lock. Results
cannot overwrite a newer revision. Action-owned score overrides keep precedence, and only inferred
tags are replaced; provider, feed, rule, manual, and unknown provenance remains intact.

Embeddings and clustering remain creation-time semantic enrichment performed by the post-crawl
pipeline for genuinely new articles. Publisher revisions update the stored reading copy but do
not automatically re-enter that semantic pipeline. Existing embeddings, clusters, events,
topics, islands, representative relationships, and semantic comparison state are preserved.
Semantic state for existing articles is rebuilt only through explicit maintenance or rebuild
workflows. Motivation is that the semantic pipeline is expensive and complex. It should not be 
rerun for minor publisher changes.

Generated Event, Topic, and Island presentation labels also use durable `semantic_label` jobs.
Jobs are enqueued only after the owned target exists, reload current bounded title context, and
update only the generated label field. Deterministic names remain available while a label is
pending or failed, and optional label failures never fail semantic persistence.

Actions and article analysis receive one canonical representation: sanitized body HTML when
available, otherwise safe description HTML, plus visible body text when available, otherwise
normalized description text. Language detection uses the same canonical visible text.

---

# Hotlinks

HTML processing only returns outbound hotlink candidates; it does not write them. Candidates are
persisted after a new article is successfully inserted or an accepted publisher update commits.
Duplicates, articles with a filteredInd = true, failed writes, unchanged entries, and discard-matched revisions do
not contribute hotlinks.

Only HTTP(S) links outside the article host are candidates. The apex host and its leading `www.`
alias are treated as the same host, while other subdomains remain distinct. Hotlink URLs use the
same conservative URL normalization as article identity.

---

# Persistence

Only articles that:

- are eligible
- are not updates
- are not duplicates

are inserted into the database.

Discard-matched entries are inserted with `filteredInd = true` and skip enrichment and tag writes.

Concurrent crawlers discovering the same article should still produce exactly one persisted record.

Creation and crawl-owned tag writes share one transaction. Publisher source updates, affected
derived fields, and crawl-owned tag reconciliation also share one transaction. Hotlink ingestion
occurs only after those transactions succeed.

Insert-race recovery is limited to recognized feed-scoped exact-URL and normalized-URL unique
constraints. The winner is reloaded using exactly the fields in the violated constraint, then the
normal update classifier is applied to that specific row. Unknown unique errors are rethrown.

Losing a recognized race to another crawler is considered a successful outcome.

---

# Progress

Crawl exposes observable progress.

Callers should be able to distinguish:

- new articles
- updated articles
- errors
- timeouts
- processed feeds
- whether the overall crawl timed out

Skipped, unchanged, and duplicate entries currently share the zero-change result
and are not exposed as separate aggregate counters.

An empty crawl can still be completely successful.

---

# Product Promise

Refreshing feeds should feel invisible.

Existing articles quietly receive publisher corrections.

Duplicate noise never reaches the reader.

New articles become immediately searchable, readable, taggable and ready for downstream recommendation and semantic processing.

The crawler succeeds when external feed chaos consistently produces one clean, trustworthy article library.

# CrawlRun concurrency

Every complete user crawl must acquire a `crawl_runs` row through the centralized per-user crawl
entry point before loading feeds, actions, or article caches. A database-enforced unique active-user
constraint allows only one `running` row per user across all workers. A duplicate acquisition is a
normal `crawl_already_running` outcome; crawls for different users may still run concurrently.

An active run renews its ownership heartbeat every `CRAWL_RUN_HEARTBEAT_INTERVAL_MS` (30 seconds by
default). A run whose heartbeat is older than `CRAWL_RUN_STALE_AFTER_MS` (effectively at least three
heartbeat intervals) is conditionally marked `failed` before replacement. The same unique constraint
arbitrates concurrent recovery attempts, so only one replacement can become active.

Serializing normal ingestion per user keeps the crawl's loaded action set, duplicate caches,
publisher-update classification, and filtering decisions from being interleaved by another crawl.
Article identity constraints and recognized insert-race recovery remain defense-in-depth for writes
already in flight. New crawl entry points must reuse this acquisition path rather than creating
`CrawlRun` rows or invoking feed/article processing directly.
