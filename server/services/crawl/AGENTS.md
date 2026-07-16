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
   └─ accepted (filteredInd = false) → AI enrichment → persist article and tags
        ↓
AI enrichment
        ↓
Persist article and crawl-owned tags transactionally
        ↓
Persist accepted hotlink observations
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
- original, sanitized, or visible content and their hashes
- description
- URL
- lead image
- structured media
- publication date

If none of these changed, no database update is performed.

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

Duplicate detection is only executed for entries that were **not** matched through external identity.

Its purpose is preventing multiple local articles representing the same information.

Duplicate checks run in this architectural order:

1. visible-text hash within the user
2. original-source hash within the user
3. normalized URL hash within the feed
4. exact URL hash within the feed
5. exact title fallback within the feed

The title fallback is only available when the entry lacks a strong HTTP(S) URL, the normalized
title is at least 20 characters, and publication dates are within seven days.

Content hashes are lookup signals, not database uniqueness constraints. Exact and normalized URL
hashes are protected by feed-scoped unique constraints.

Filtered articles remain part of publisher identity and insert-race handling, so later revisions
update the same stored row. They do not participate in content-hash or title-based duplicate
suppression; a hidden article must not prevent another active source from entering the library.
Feed-scoped URL identity continues to include filtered rows because database URL uniqueness and
the publisher-update flow require one stored row for the same feed URL.

Duplicate detection never updates existing articles.

---

# Content Normalization

Feed content is stored in multiple complementary forms.

## contentOriginal

The raw selected body value supplied by the feed parser, without compatibility transforms,
entity decoding, sanitization, or DOM serialization.

Used for:

- update detection
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

- update detection
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
- favourite
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

Genuinely new articles are enriched unless AI analysis is disabled for the feed. Existing
publisher identities may refresh lightweight article-level enrichment only when content, title,
or description changes. Source-only changes do not spend an AI call.

Typical enrichment includes:

- summaries
- tags
- language
- sentiment
- advertisement score
- quality score

Embeddings and clustering remain creation-time semantic enrichment performed by the post-crawl
pipeline for genuinely new articles. Publisher revisions update the stored reading copy but do
not automatically re-enter that semantic pipeline. Existing embeddings, clusters, events,
topics, islands, representative relationships, and semantic comparison state are preserved.
Semantic state for existing articles is rebuilt only through explicit maintenance or rebuild
workflows. Motivation is that the semantic pipeline is expensive and complex. It should not be 
rerun for minor publisher changes.

Actions and lightweight analysis receive one canonical representation: sanitized body HTML when
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

A running row older than `CRAWL_RUN_MAX_RUNNING_MINUTES` (60 minutes by default) is conditionally
marked `failed` before replacement. The same unique constraint arbitrates concurrent recovery
attempts, so only one replacement can become active. The threshold must remain longer than a valid
user crawl because this first recovery design intentionally has no heartbeat or renewable lease.

Serializing normal ingestion per user keeps the crawl's loaded action set, duplicate caches,
publisher-update classification, and filtering decisions from being interleaved by another crawl.
Article identity constraints and recognized insert-race recovery remain defense-in-depth for writes
already in flight. New crawl entry points must reuse this acquisition path rather than creating
`CrawlRun` rows or invoking feed/article processing directly.
