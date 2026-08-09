# Crawl entry extraction and identity

This folder converts a parser-independent canonical feed entry into the publisher fields and stable
identity inputs used by article candidate construction. It is deliberately format-neutral: RSS,
Atom, and JSON Feed differences are resolved by the Feedsmith adapter before this layer.

The behavior was hardened using Feedbin and Feedkit as reference implementations. RSSMonster now
replicates their important format-aware principles—especially trusting opaque feed IDs and resolving
relative links—while retaining its own ingestion-time normalization and persistence model.

## Position in the crawl

The end-to-end path is:

1. Feedsmith parses RSS, Atom, or JSON Feed into a canonical entry.
2. The adapter preserves field precedence, content/description kinds, format IDs, media, dates,
   entry links, feed URLs, and available `xml:base` values.
3. `extractEntryFields.js` selects the canonical title, author, description, content, URL,
   categories, publication date, modification date, and explicit content kinds.
4. `buildArticleCandidate.js` validates entry eligibility, processes content/media/images, fills
   conservative date/title fallbacks, and computes source/text hashes.
5. `articleIdentityResolver.js` chooses the final identity after hashes are available.
6. Orchestration performs identity lookup, duplicate-content detection, actions, and analysis before
   delegating writes to `../persistence/`.

Extraction describes publisher input. It does not decide whether similar content is a duplicate.

## Canonical entry fields

`extractEntryFields.js` maps the feed adapter contract to crawl names:

| Field | Contract |
| --- | --- |
| `title` | Canonical publisher title, falling back to `Untitled` until content-based title generation. |
| `link` | Safe absolute HTTP(S) article URL or `null`. |
| `description` / `descriptionKind` | Raw selected summary/description and its `html` or `text` semantics. |
| `content` / `contentKind` | Raw selected body and its `html` or `text` semantics. |
| `author` | Normalized canonical author string or `null`. |
| `categories` | Canonical category/tag strings supplied by the feed. |
| `publishedAt` | Best publisher publication time. |
| `modifiedAt` | Best publisher update time, kept separate from publication. |

The adapter owns RSS/Atom/JSON field precedence. In particular, RSS `content:encoded`, Atom
HTML/XHTML content, JSON Feed `content_html`, and JSON Feed `content_text` retain different kinds
even though they share the canonical `content` field.

## Entry URL resolution

Entry URLs and article-content URLs are different concerns. The feed adapter resolves the entry's
navigable page URL using the nearest available base:

1. Entry-level `xml:base`.
2. The fetched feed URL.
3. The feed/site URL where appropriate.

Root-relative, path-relative, and protocol-relative declarations can therefore become absolute.
Only credential-free HTTP(S) results are navigable. `urlStatus` distinguishes a genuinely missing
link from a declared link that was malformed or unsafe. Relative URLs inside article HTML are not
handled here; `../content/normalizeHtmlUrls.js` resolves those against the accepted article URL.

RSSMonster does not manufacture links from GUIDs or other opaque IDs. A stable-ID entry may be
stored with `url = null`; server APIs and the client treat this as “no external article URL.” An
entry without a URL remains eligible only when it has a stable RSS GUID, Atom ID, or JSON Feed ID.

## Article identity precedence

Identity matching answers “is this the same feed entry?” and is always separate from duplicate
content detection. `articleIdentityResolver.js` enforces this precedence:

1. Stable format-provided ID: RSS GUID, Atom ID, or JSON Feed ID.
2. Complete canonicalized HTTP(S) entry URL when no stable ID exists.
3. Deterministic metadata/content hash when neither exists.

A valid stable ID is never replaced merely because the entry also has a URL. Consequently tracking
query changes, redirects, slug changes, and canonical URL changes do not split stable-ID entries;
two entries with different stable IDs are not merged merely because they share a URL.

Publisher IDs are opaque. Normalization removes surrounding parser noise but does not reinterpret,
truncate, URL-decode, or synthesize meaning from their contents. Empty or malformed IDs are not
treated as stable evidence. Historical URL-suffix hashes are retained only as a migration lookup
mechanism and are not generated as new identities because suffix collisions can merge unrelated
articles.

## Legacy identity migration

Earlier RSSMonster versions could persist a URL-derived identity even when a stable feed ID existed.
During update lookup, persistence may upgrade an existing `normalized-url` row to the incoming stable
ID. A historical `url-suffix-hash` row is upgraded only when its complete stored normalized URL also
matches. This alias strategy converges old rows without mass-duplicating articles or trusting an
ambiguous suffix.

## Date and title normalization

The feed adapter normalizes supported publisher date fields. Candidate construction then applies
conservative fallbacks:

- A valid modification date may stand in for a missing publication date and is marked inferred.
- A feed-level publication fallback may be used when supplied by orchestration.
- A date encoded in a safe article URL may be used as the last publication fallback.
- `crawlSince` rejects older entries only when both dates are valid.

Publisher titles have HTML entities decoded. If a title is absent, RSSMonster generates a concise
title from canonical visible article/description text, then the feed title, and finally `Untitled`.
The generator does not parse or sanitize the article body itself.

## Candidate eligibility

`buildArticleCandidate.js` rejects an entry before database identity work when:

- Its declared URL remains unsafe after adapter normalization.
- It has neither a usable article URL nor a stable format identity.
- It predates a configured `crawlSince` boundary.
- It contains no body, description, structured media, or usable lead image.

Linkless stable-ID entries and media-only entries remain valid. Identity fallback is resolved after
content hashes exist so it is deterministic even without a URL.

## Boundaries

Extraction must not query Article records, perform duplicate matching, sanitize HTML, persist rows,
apply user actions, write tags, call OpenAI, classify semantic clusters, or update caches. Those
responsibilities belong to orchestration, content/media processing, persistence, and downstream
enrichment respectively.
