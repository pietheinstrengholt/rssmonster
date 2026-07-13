# Crawl Architecture

Crawl is the subsystem responsible for keeping RSSMonster's article library current, clean, and trustworthy. It converts external RSS and Atom entries into local articles while preserving user intent, preventing duplicate noise, updating revised articles, and preparing new content for downstream processing.

This document describes the architectural contract of Crawl. It intentionally focuses on behaviour rather than implementation.

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
- Enriching newly created articles.
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

Original publisher content should never be destroyed unnecessarily.

---

## Safe by default

All external HTML is treated as untrusted.

Stored article bodies must be suitable for safe rendering.

---

# Feed Entry Eligibility

An entry is eligible when it satisfies all required conditions.

Required:

- belongs to the current user
- newer than crawlSince
- contains a valid article URL
- contains either:
  - article body
  - description
  - structured media
- is not already represented by article identity
- is not rejected by user rules

Expensive AI work should only happen after eligibility has been established.

---

# Processing Pipeline

The ingestion pipeline follows a fixed order.

```
Extract feed fields
        ↓
Resolve external article identity
        ↓
Normalize HTML and visible text
        ↓
Extract structured media
        ↓
Update existing article by external identity
        ↓
Duplicate detection
        ↓
Apply user actions
        ↓
AI enrichment
        ↓
Persist article
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

Tracking parameters and URL noise should be removed before comparison.

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
- contentHash
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

---

# Duplicate Detection

Duplicate detection is only executed for entries that were **not** matched through external identity.

Its purpose is preventing multiple local articles representing the same information.

Duplicate detection relies on progressively weaker evidence.

Typical signals include:

- exact URL
- normalized URL
- original content hash
- visible text hash
- title and publication fallback

Duplicate detection never updates existing articles.

---

# Content Normalization

Feed content is stored in multiple complementary forms.

## contentOriginal

Publisher content after minimal normalization.

Preserves the original article body as closely as possible.

Used for:

- update detection
- content hashing
- future reparsing

---

## contentStripped

Safe HTML.

Suitable for rendering inside RSSMonster.

---

## contentText

Plain visible text.

Used for:

- language detection
- AI analysis
- embeddings
- search

---

When article bodies are missing, descriptions may provide visible text while remaining separate feed metadata.

---

# Content Hashes

RSSMonster maintains two different hashes.

## contentHash

Hash of the normalized original publisher content.

Purpose:

- update detection
- duplicate detection
- publisher revision detection

Small publisher changes should result in a different hash.

---

## contentStrippedHash

Hash of visible plain text.

Purpose:

- duplicate detection
- semantic identity

Equivalent visible text should generate the same hash even if HTML differs.

---

# Media

RSSMonster extracts structured media separately from article bodies.

Supported concepts include:

- video
- audio
- image galleries

Media metadata is normalized into structured JSON.

Media does not replace richer article content.

When an article primarily consists of media, structured media is sufficient for the article to be considered valid.

Lead images remain article metadata rather than article identity.

---

# User Rules

User rules execute after duplicate prevention but before persistence.

Rules may:

- reject articles
- mark read
- favourite
- add tags
- adjust scores

Rejected articles never reach AI enrichment.

---

# Analysis

Only genuinely new articles are enriched.

Typical enrichment includes:

- summaries
- tags
- language
- sentiment
- advertisement score
- quality score
- embeddings
- clustering

Existing articles updated through publisher revisions are not automatically re-analysed.

---

# Persistence

Only articles that:

- are eligible
- are not updates
- are not duplicates
- are not rejected

are inserted into the database.

Concurrent crawlers discovering the same article should still produce exactly one persisted record.

Losing a race to another crawler is considered a successful outcome.

---

# Progress

Crawl exposes observable progress.

Callers should be able to distinguish:

- new articles
- updated articles
- skipped articles
- duplicate articles
- errors

An empty crawl can still be completely successful.

---

# Product Promise

Refreshing feeds should feel invisible.

Existing articles quietly receive publisher corrections.

Duplicate noise never reaches the reader.

New articles become immediately searchable, readable, taggable and ready for downstream recommendation and semantic processing.

The crawler succeeds when external feed chaos consistently produces one clean, trustworthy article library.