# Crawl article persistence

This folder owns the database write contract for normalized article candidates and crawl-owned tags.
It creates new Articles, reconciles publisher revisions, protects user state, and safely recovers
from concurrent unique-key races. Parsing, HTML cleanup, media detection, identity selection, and
duplicate-content decisions happen before this layer.

The revision behavior follows lessons replicated from Feedbin's mature entry-update model, adapted
to RSSMonster's sanitized-at-rest content, explicit source/text hashes, user-scoped identity, and
post-crawl enrichment pipeline.

## Inputs and persisted representations

`buildArticlePersistenceValues.js` is the canonical mapping from a processed candidate to Article
columns. It keeps create and update paths aligned and owns:

- Stable publisher identity (`externalId`, `externalIdType`).
- Nullable article URLs plus raw and normalized URL hashes.
- Raw source, sanitized HTML, canonical visible text, description derivatives, and their hashes.
- Structured media, selected lead-image URL/dimensions/MIME/source, and language.
- Publication/modification metadata at MySQL whole-second precision.
- Crawl action state, filter state, hotlink counts, analysis scores, summaries, and source labels.

Missing values are represented as `null` where the storage contract allows them. In particular,
linkless stable-ID articles persist a null URL and null URL hashes rather than a fabricated link.
`contentOriginal` remains raw source; `contentHtml`, `descriptionHtml`, and structured media are the
safe normalized representations intended for presentation.

## Creating an article

`saveArticle.js`:

1. Checks the crawl deadline and execution lease.
2. Validates that the feed has a user owner.
3. Builds canonical Article values.
4. Creates the Article and its crawl-owned tags in one transaction.
5. Rechecks deadline/lease ownership around transactional work.
6. Omits derived tags and user-facing action values for entries discarded by a matching rule.

If a concurrent crawl wins the same unique identity, the failed transaction is rolled back and the
service reloads only the exact constraint winner. Recovery recognizes the concrete user/feed,
publisher identity, normalized URL, or other named unique-key evidence supplied by Sequelize. It
does not use broad title/content queries that could select an unrelated article.

The result explicitly reports whether the row was created or recovered from a conflict.

## Updating an existing article

`updateArticle.js` reconciles one exact user/feed-owned Article. It may receive an already resolved
row or locate one by the incoming identity. Before writing it:

1. Validates user and feed ownership.
2. Resolves sparse incoming publisher fields against stored values.
3. Builds canonical persisted values using the same mapper as creation.
4. Compares stable representations and produces an explicit change classification.
5. Decides whether the change is a content revision, metadata correction, derivation repair, URL
   update, media update, lead-image update, or legacy identity upgrade.
6. Applies source fields and crawl-owned tag reconciliation transactionally.
7. Rechecks the execution deadline and lease before commit.

Sparse or empty publisher values do not erase meaningful stored content, author, date, URL, media,
or image metadata. A newly inferred publication date does not replace a known stored publication
date. User-owned state—read/unread status, favorites, clicks, and manual tags—is preserved.

## Revision and update semantics

RSSMonster distinguishes publisher revisions from harmless derivative or metadata changes:

- Body HTML/text/hash, title, or raw description changes can confirm a content revision.
- Author, date, URL, media, lead-image, and other source metadata can update without pretending the
  publisher rewrote the article body.
- `modifiedAt` advances only for a confirmed content revision, using a newer valid publisher
  modification time when available and otherwise the detected revision time.
- Byte-identical raw source with only `contentText`/`contentTextHash` differences is treated as a
  visible-text extraction repair, not a mass publisher revision.
- Backfilling `descriptionHtml`, `descriptionText`, and related canonical body derivatives for an
  unchanged raw description is also a derivation repair.

This compatibility behavior matters after improvements such as block-aware visible-text extraction
and sanitizing legacy raw descriptions: existing articles receive correct derived fields without
all appearing newly revised.

## Deterministic comparisons

Update comparison normalizes values before deciding that they changed:

- Dates compare as normalized instants.
- Missing values compare consistently as null.
- HTML ignores known temporary Kickstarter asset signatures.
- Structured media recursively sorts keys and compares only the stable contract fields.

Stable media fields include type, provider, external ID, primary/embed/thumbnail URLs, duration,
dimensions, MIME type, file size, live state, gallery items, native sources, and safe caption track
metadata. This allows changes to inline audio/video, enclosures, Media RSS, JSON attachments, and
galleries to participate in revision planning without reacting to arbitrary parser metadata.

Update diagnostics log changed field names and bounded hashes/lengths for large publisher values;
they do not dump entire article bodies. Structured media diagnostics identify the differing leaf
paths.

## Identity migration during persistence

Stable RSS GUID, Atom ID, and JSON Feed ID identities are authoritative. To avoid duplicates after
the identity-precedence correction, update lookup may alias an incoming stable ID to:

- A historical `normalized-url` identity with the same full normalized URL.
- A historical `url-suffix-hash` identity only when the complete URL also agrees.

The existing row is upgraded in place. Identity migration remains separate from duplicate-content
matching and never relies on a suffix alone.

## Tags

`tags.js` normalizes tag names, removes duplicates, records provenance, and owns transactional
creation/reconciliation for generated, feed, and rule tags. Manual tags are user-owned and survive
crawl updates. Updating derived tags replaces only crawl-owned relationships for the article.

## Transaction, ownership, and cache boundaries

All writes are user-scoped and feed-scoped. Transactions encompass Article changes and related tag
changes so readers never observe a partially reconciled article. Deadline and lease checks prevent
a stale crawl worker from committing after ownership has moved to another worker.

Persistence does not mutate duplicate caches before commit. Orchestration is responsible for cache
updates and downstream enrichment only after the database result is known.

## Boundaries

Persistence must not parse RSS/Atom/JSON fields, clean or sanitize HTML, resolve relative URLs,
extract media, select lead images, apply user actions, call inference, choose semantic memberships, or
decide whether two different entries are content duplicates. It applies decisions already made by
the feed adapter, candidate builder, action engine, duplicate detector, and orchestration layer.
