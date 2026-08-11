---
title: Search
parent: Using RSSMonster
nav_order: 4
---

# Search Guide

Find the right articles fast with a few expressive tokens. You can mix free text with filters; tokens override the UI status/sort settings.

Search expressions are also the query language used by
[Smart Folders](smart-folders.md). A query that works in the search bar can be
saved as a Smart Folder to create a reusable, dynamically updated view.

---

## Quick Examples

- `javascript @today sort:recommended` - fresh JavaScript stories ranked by recommended score
- `title:"rust async" unread:true` - title contains the exact phrase, only unread
- `tag:ai quality:>0.7 sort:quality` - tagged items with high quality first
- `author:"Ada Lovelace" language:en` - English-language articles by a matching author
- `developing:true eventCount:>=3` - unread developing coverage from events with at least three articles
- `hot:true limit:50` - up to 50 articles marked hot

---

## Complete Expression Reference

The following table lists every expression accepted by the search query
parser. Expressions can be combined with spaces; all active filters must match
unless a filter's detailed description below states otherwise.

| Type | Supported expressions |
| --- | --- |
| Free text | `word`, `multiple words`, `"exact phrase"` |
| Title | `title:word`, `title:"exact phrase"` |
| Author | `author:name`, `author:"full name"` |
| Tag | `tag:name` |
| Language | `language:en`, using an exact two- or three-letter code |
| Favorite | `favorite:true`, `favorite:false`, `star:true`, `star:false` |
| Read state | `unread:true`, `unread:false`, `read:true`, `read:false` |
| Interaction state | `clicked:true`, `clicked:false`, `seen:true`, `seen:false` |
| Hot state | `hot:true`, `hot:false` |
| Event membership | `event:true`, `event:false` |
| Interest-island membership | `island:true`, `island:false` |
| Briefing eligibility | `briefing:true`, `briefing:false` |
| Developing-story eligibility | `developing:true`, `developing:false` |
| First-seen age | `firstSeen:12h`, `firstSeen:7d` |
| Event size | `eventCount:3`, `eventCount:>=3` |
| Quality score | `quality:0.7`, `quality:=0.7`, `quality:>0.7`, `quality:>=0.7`, `quality:<0.7`, `quality:<=0.7` |
| Freshness score | `freshness:0.5`, `freshness:=0.5`, `freshness:>0.5`, `freshness:>=0.5`, `freshness:<0.5`, `freshness:<=0.5` |
| Publication date | `@today`, `@yesterday`, `@lastweek`, `@YYYY-MM-DD`, `@"N days ago"`, `@N days ago`, `@"last Monday"`, `@last Monday` |
| Sorting | `sort:desc`, `sort:asc`, `sort:trust`, `sort:recommended`, `sort:quality`, `sort:attention` |
| Result limit | `limit:50` |

Use the lowercase expression spellings shown above. Boolean values are
case-insensitive. Use a colon between an expression name and its value, and
separate expressions with spaces. Parentheses and explicit `AND` or `OR`
operators are not part of the query language.

---

## Text Search Basics

- Unquoted words use AND across title/content: `rust borrow checker` requires all three words somewhere in title or body.
- Quotes match phrases: `"prompt injection"` matches that exact sequence in title or content.
- `title:keyword` searches only the title. If you also add free-text terms, the title must match and any of those terms may appear in content. Use `title:"exact phrase"` for an exact title phrase.

---

## Filters & Tokens

### Article state

- `unread:true|false` includes unread or read articles. `read:true|false` provides the inverse form.
- `favorite:true|false` includes starred or unstarred articles. `star:true|false` is an alias with the same behavior.
- `clicked:true|false` includes articles with at least one outbound click or with no clicks.
- `seen:true|false` includes articles that have or have not appeared on screen.
- `hot:true|false` includes articles marked hot or not hot within the active feed/category scope.

### Article fields and age

- `tag:my-tag` matches articles carrying that tag for the current user.
- `title:keyword` or `title:"exact phrase"` searches only article titles.
- `author:name` or `author:"Ada Lovelace"` performs a case-insensitive author substring match.
- `language:en` matches an exact two- or three-letter stored language code, such as `en` or `eng`.
- `firstSeen:12h` or `firstSeen:7d` includes articles first seen within that many hours or days, plus articles that have never been seen.

Tag values should be a single unquoted token. Quoted tag values retain their
quote characters and should not be used.

### Scores

- `quality:>0.7` filters the computed 0–1 article-quality score.
- `freshness:>=0.5` filters the computed 0–1 publication-time freshness score.

Both score filters accept `>`, `<`, `>=`, `<=`, or `=`. Omitting the operator uses `>=`, so `quality:0.7` means `quality:>=0.7`.

### Semantic and briefing filters

- `event:true` includes articles assigned to an event; `event:false` includes articles without an event.
- `eventCount:>=3` includes articles whose event has at least three articles. `eventCount:3` is the equivalent shorthand; other comparison operators are not supported.
- `island:true` includes articles whose event has a primary or secondary topic linked to one of the user's active interest islands. `island:false` includes articles without such a link, including articles without an event. Archived islands do not qualify.
- `developing:true` includes only unread articles selected as the developing, non-representative article for an event and forces event grouping with developing-event selection. `developing:false` excludes articles meeting that exact condition.
- `briefing:true` includes articles with a nonzero interest score or membership in an event containing more than one article. `briefing:false` includes articles with neither signal. Briefing preferences can further narrow results when the Briefing view invokes this filter.

### Sorting and limits

- `sort:desc` orders newest first; `sort:asc` orders oldest first.
- `sort:trust` orders by feed trust, then newest publication date and article ID.
- `sort:recommended` uses freshness, interest, quality, event coverage, source diversity, corroboration, and applicable boosts.
- `sort:quality` orders by computed article quality.
- `sort:attention` orders by recorded reading attention and outbound-click activity.
- `limit:50` caps the result set and overrides the normal search or Smart Folder limit.

Use a positive integer for `limit`. A value of `0` is treated as though no
explicit limit was supplied.

---

## Date Filters

- Specific day (UTC): `@YYYY-MM-DD`, for example `@2025-12-14`. The value must be a real calendar day;
  normalized or impossible dates such as `@2026-02-31` are rejected.
- Rolling window: `@today` (last 24h)
- Previous UTC day: `@yesterday`
- Previous 7 days: `@lastweek`
- Exact N days ago (UTC day): `@"3 days ago"` or `@3 days ago`
- Previous named weekday: `@"last Monday"` or `@last Monday`

Date filters replace the normal published-date window; they are inclusive of the whole day when applicable.

---

## Defaults & Limits

- If you provide search text, RSSMonster searches **all statuses** unless you add a status token. Without search text it defaults to unread.
- When any search expression is used and no `limit` is provided, results are capped at 500 after sorting. Smart folders may apply their own limits.
- Quality filters run after fetching, so they can reduce results even when the limit is higher.

---

## Combining Tokens

- Mix tokens freely: `title:ai tag:ml island:true @yesterday sort:attention limit:100`
- Title + content: `title:typescript decorators` -> title matches "typescript", content matches any of `decorators`.
- Status + date: `unread:true @today` keeps only unread items from the last 24 hours.

Use these expressions directly in the search bar or save them as Smart Folder
queries—the two features share the same syntax. See
[Smart Folders](smart-folders.md) for instructions on creating and managing
saved views.
