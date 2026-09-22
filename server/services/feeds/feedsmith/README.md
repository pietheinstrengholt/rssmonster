# Feedsmith adapter

This directory is the only production boundary that understands Feedsmith output shapes.

`parseFeed.js` exposes the public parsing operations. Parsed data is converted immediately into
RSSMonster-owned canonical feed and entry objects before it reaches controllers or crawl services.

FeedSmith's universal `parseFeed()` detects RSS, Atom, RDF, and JSON Feed automatically.
Its `format` (`rss`, `atom`, `rdf`, or `json`) is saved as `Feed.feedType` during
subscription discovery and refreshed after successful changed-feed crawls. JSON Feed
1 and 1.1 both use `json`. Separate signature-only detection is unnecessary; parsing
also validates the source. Unparsed offline imports retain a null type until crawled.

The canonical feed contract contains:

- `format`
- `title`
- `description`
- `faviconUrl`
- `publishedAt`
- `selfUrl`
- `entries`

Each canonical entry contains:

- `title`
- `url`
- `urlStatus`
- `contentBaseUrl`
- `descriptionBaseUrl`
- `description`
- `descriptionKind`
- `content`
- `contentKind`
- `author`
- `authors` (nullable ordered array of `{ name, url }`, each value nullable)
- `originalSource` (nullable `{ title, id, url }` publisher-declared provenance)
- `languageHint`
- `categories`
- `publishedAt`
- `modifiedAt`
- `externalId`
- `externalIdType`
- `media`
- `imageCandidates`

Code outside this directory must consume these canonical fields and must not inspect Feedsmith
namespaces or container shapes directly.

Atom text constructs retain their HTML/plain-text meaning for bodies and summaries;
formatted titles become display text. Construct-level XML bases resolve against
feed/entry XML ancestry and remain separate for body and summary processing.
Native content takes precedence over namespace fallbacks (Atom content, Dublin
Core metadata, Media RSS descriptions, and iTunes author/artwork). Atom enclosure
links supply media or image candidates rather than article permalinks. Atom entries
inherit source/feed authors and JSON Feed items inherit feed authors when entry
authors are absent. RSS/RDF Atom self links retain publisher feed identity.

Native author lists take precedence over legacy and namespace bylines. Fallbacks
include Dublin Core/Terms creators, namespaced Atom authors and iTunes author.
Atom source/feed and JSON feed authors are inherited when entry authors are absent.
All authors in the selected list are retained, in order, with exact duplicates
removed. Profile links are resolved HTTP(S) URLs; unknown names/URLs stay null.
Email-only XML people retain the existing email-as-display-name fallback. Names
are never split on commas. `author` joins known names for existing search, item
filters, compact presentation, and external integration contracts.

Original source uses RSS `source`, Atom `source` (including the Atom namespace),
or Dublin Core/Terms `source` references. IDs stay opaque, titles become display
text, and only HTTP(S) URLs are navigable. JSON Feed `external_url` is a related
resource, so it is not treated as proof of original provenance. No source is
inferred from the current subscription or its publisher name.

`languageHint` is a validated, canonical language tag. Selected Atom body/summary
declarations precede entry declarations, then feed defaults. JSON/RSS language,
XML `lang`, and Dublin Core/Terms languages are supported. Missing, malformed,
unknown, and non-specific declarations leave the existing text detector in use.

Favicons use the first usable HTTP(S) URL from `favicon`, `icon`, `logo`, then
`image`, then iTunes artwork. Relative URLs resolve against the feed's XML base or fetched URL, with
the publisher site as a fallback when fetch provenance is unavailable. Candidates
must fit the stored URL column. Successful changed-feed crawls replace the stored
icon when one is supplied and retain it when no usable candidate exists. Unchanged
responses retain the icon without reparsing. Publisher HTML icon discovery is not
performed.
