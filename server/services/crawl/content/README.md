# Crawl content processing

This folder turns publisher-provided article bodies and descriptions into the safe, stable
representations used for reading, searching, duplicate detection, actions, revision detection,
language detection, and later semantic analysis.

The recent content-pipeline hardening replicates several proven behaviors studied in Feedbin and
Feedkit—especially preserving source semantics, separating raw and display content, robust visible
text extraction, safe URL handling, and structured media presentation. The implementation remains
RSSMonster-specific: normalization happens once during ingestion and the database stores sanitized
display HTML rather than relying on a Feedbin-style render-time formatter.

## Representations and storage contract

RSSMonster deliberately keeps source, display, and analysis representations separate:

| Value | Meaning |
| --- | --- |
| `contentOriginal` | The selected feed body exactly as supplied to crawl processing. It is never rewritten or used directly as display HTML. |
| `contentHtml` | Cleaned, URL-normalized, sanitized reading HTML. This is safe for the client render path. |
| `contentText` | Canonical visible text derived from final display HTML, with structural boundaries preserved. |
| `contentSourceHash` | Hash of `contentOriginal`, used to recognize byte-identical publisher source. |
| `contentTextHash` | Hash of canonical visible text, used by comparisons and duplicate/revision logic. |
| `description` | The selected raw feed description. It is preserved as source data and never passed to `v-html`. |
| `descriptionHtml` | Sanitized, URL-normalized HTML derived from the description during ingestion. |
| `descriptionText` | Canonical visible text derived from the sanitized description. |

Description-only entries promote `descriptionHtml` and `descriptionText` into the canonical reading
body. If a body has media markup but no visible text, the independently sanitized description may be
appended. A processing failure yields escaped plain text or empty content, never raw feed HTML.

## Content-kind contract

The feed adapter supplies `contentKind` and `descriptionKind` whenever the source format defines the
semantics:

- RSS `content:encoded` and Atom HTML/XHTML content are HTML.
- JSON Feed `content_html` is HTML.
- JSON Feed `content_text` is literal text, even when it contains `<`, `>`, ampersands, or strings
  that resemble tags.
- Summary and description fallbacks retain their known kind or use conservative legacy inference.

`processHtmlContent()` and `processDescriptionContent()` consume that kind explicitly. Legacy parser
inputs without metadata retain a compatibility heuristic, but known source semantics always win.
Plain text is escaped and converted into paragraphs and line breaks by
`normalizePlainTextContent.js`; it is never parsed as publisher markup.

## HTML processing order

`processHtmlContent.js` owns the body pipeline. Ordering is intentional because moving a stage can
destroy information needed by the next one:

1. Preserve the selected input as `contentOriginal`.
2. Apply source-string compatibility transforms that must run before DOM parsing.
3. Parse malformed HTML with Cheerio's HTML recovery behavior.
4. Apply DOM-based publisher transforms.
5. Run `prepareHtmlContent()` to recover lazy images and remove known active/non-content structures.
6. Resolve links, images, responsive sources, media sources, posters, and caption tracks against the
   article URL with `normalizeHtmlUrls()`.
7. Extract inline `<audio>` and `<video>` into structured media before sanitization removes native
   publisher media elements.
8. Run `finalizeHtmlContent()` to repair lists/tables, normalize images, remove empty wrappers, and
   canonicalize supported publisher cards.
9. Collect safe cross-origin hotlink candidates from normalized anchors.
10. Sanitize the resulting fragment with the explicit element, attribute, class, and URL allowlists.
11. Derive canonical visible text from the final sanitized HTML.
12. Compute source/text hashes and detect language from visible text.

The description path follows the same source transform, DOM preparation, URL normalization, final
cleanup, sanitization, and visible-text rules, but it does not extract article media or hotlinks.

## Cleanup and malformed markup

`cleanupHtmlContent.js` performs deterministic structural cleanup. It:

- Recovers real image URLs from common lazy-loading attributes and `srcset`.
- Rejects placeholder and tracking-pixel image sources.
- Normalizes `<picture>` sources and image attributes.
- Repairs orphan list items and table elements produced by malformed publisher HTML.
- Removes scripts, styles, templates, metadata, forms, and other non-reading structures.
- Removes empty wrappers while retaining meaningful media and text structures.
- Delegates supported card conversion to `normalizePublisherCards.js`.

Cheerio repairs ordinary malformed HTML. If the processing pipeline still throws, the fallback uses
`htmlToVisibleText()` plus escaped plain-text rendering so a parser failure cannot expose active
markup.

## Visible text

`htmlToVisibleText.js` is the single canonical HTML-to-visible-text extractor. Do not use Cheerio
`.text()` for article-visible text. The extractor:

- Inserts stable semantic boundaries around paragraphs, headings, lists, blockquotes, tables,
  `<br>`, `<pre>`, and similar block structures.
- Preserves useful paragraph and line boundaries without unstable formatting noise.
- Keeps nested inline text together while preventing adjacent blocks from becoming `Helloworld`.
- Decodes entities through the HTML parser.
- Excludes scripts, styles, templates, metadata, and other non-visible nodes.
- Normalizes whitespace predictably for hashing and comparisons.

Visible-text-only changes caused by upgrading this extractor are recognized by persistence as a
derivation repair when `contentSourceHash` is unchanged. This prevents a deployment from treating
every legacy article as a publisher revision.

## URL normalization and safety

`normalizeHtmlUrls.js` owns relative URL resolution. It processes anchors, images, picture sources,
inline audio/video sources, posters, tracks, and `srcset` candidates before sanitization. Only safe
HTTP(S) resource/navigation URLs survive; local anchor fragments remain valid where appropriate.

`sanitizeHtmlContent.js` is the final security boundary. It:

- Uses the allowlists in `htmlContentAllowlists.js`.
- Removes active elements, event handlers, inline styles, unsafe classes, and unsupported embeds.
- Validates every URL-bearing attribute and responsive image candidate.
- Adds safe `rel` behavior to links opening a new browsing context.
- Retains only RSSMonster-owned embed/card attributes needed by the client.

Raw source fields never bypass this boundary on their way to client HTML rendering.

## Images and structured media

Image cleanup happens here, while candidate collection and lead-image selection live in
`../media/`. The content pipeline preserves useful responsive imagery and removes redundant or
decorative markup before lead-image selection inspects the resulting article.

Inline audio/video is extracted by `../media/extractInlineMedia.js` after URL rewriting and before
final sanitization. It supports multiple `<source>` values, MIME metadata, posters, duration, and
safe caption/subtitle tracks. Dangerous schemes, autoplay, event attributes, and unsupported
scriptable markup are rejected. Inline media is deduplicated against enclosures, Media RSS, and
JSON Feed attachments; matching inline metadata enriches the existing structured media object.
Because an Article currently stores one primary media object, additional or unsupported inline
media becomes a safe fallback link/text rather than disappearing.

The client renders structured video, audio, single-image, and gallery media without injecting it as
raw HTML. It also suppresses image assets already selected as the lead image or present in the
article body.

## Compatibility transforms

The `compatibility/` directory contains small transforms for WordPress, Reddit, Substack, Mastodon,
Vimeo, and other explicitly supported markup patterns. Each transform should:

- Target one publisher or known markup contract.
- Be small and independently testable.
- Be idempotent where practical.
- Produce static RSSMonster-owned markup rather than retaining publisher scripts.
- Fail locally instead of failing the complete article.

Generic cleanup must not accumulate publisher-specific selectors when a focused compatibility
module can own the behavior.

## Boundaries

Content processing returns data and has no database side effects. It must not query or persist
articles, apply user actions, call OpenAI, mutate duplicate caches, classify official sources,
write tags, or decide whether an article is new or revised.
