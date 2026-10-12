---
layout: page
title: Search
parent: Using RSSMonster
nav_order: 4
---

# Search Guide

Find the right articles fast with a few expressive tokens. You can mix free text with filters; tokens override the UI status/sort settings.

Search expressions are also the query language used by
[Smart Folders]({% link smart-folders.md %}). A query that works in the search bar can be
saved as a Smart Folder to create a reusable, dynamically updated view. From
the search results, open the three-dot **More actions** menu, choose
**Save as smart folder**, review the name and included rules, and select
**Save smart folder**. See the [steps and screenshot]({% link smart-folders.md %}#save-an-existing-search-as-a-smart-folder).

---

## Quick Examples

- `javascript @today sort:recommended` - fresh JavaScript stories ranked by recommended score
- `title:"rust async" unread:true` - title contains the exact phrase, only unread
- `tag:ai quality:>0.7 sort:quality` - tagged items ranked by Quality & source trust
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
| Tag | `tag:name`, `tag:"multiword name"` |
| Language | `language:en`, using an exact two- or three-letter code |
| Saved | `saved:true`, `saved:false`, `star:true`, `star:false` |
| Read state | `unread:true`, `unread:false`, `read:true`, `read:false` |
| Interaction state | `openedOriginal:true`, `openedOriginal:false`, `seen:true`, `seen:false` |
| Hot state | `hot:true`, `hot:false` |
| Event membership | `event:true`, `event:false` |
| Briefing eligibility | `briefing:true`, `briefing:false` |
| Developing-story eligibility | `developing:true`, `developing:false` |
| First-seen age | `firstSeen:12h`, `firstSeen:7d` |
| Event size | `eventCount:3`, `eventCount:>=3` |
| Overall quality | `quality:0.7`, `quality:=0.7`, `quality:>0.7`, `quality:>=0.7`, `quality:<0.7`, `quality:<=0.7` |
| Freshness score | `freshness:0.5`, `freshness:=0.5`, `freshness:>0.5`, `freshness:>=0.5`, `freshness:<0.5`, `freshness:<=0.5` |
| Publication date | `@today`, `@yesterday`, `@lastweek`, `@YYYY-MM-DD`, `@"N days ago"`, `@N days ago`, `@"last Monday"`, `@last Monday` |
| Sorting | `sort:desc`, `sort:asc`, `sort:topStories`, `sort:recommended`, `sort:quality` |
| Grouping | `grouping:none`, `grouping:event` |
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
- `saved:true|false` includes saved or unsaved articles. `favorite:true|false` and `star:true|false` remain aliases with the same behavior.
- `openedOriginal:true|false` includes articles with at least one recorded original opening or none. `clicked:true|false` remains an alias.
- `seen:true|false` includes articles that have or have not appeared on screen.
- `hot:true|false` includes articles marked hot or not hot within the active feed/category scope.

### Article fields and age

- `tag:my-tag` matches articles carrying that tag for the current user.
- `title:keyword` or `title:"exact phrase"` searches only article titles.
- `author:name` or `author:"Ada Lovelace"` performs a case-insensitive author substring match.
- `language:en` matches an exact two- or three-letter stored language code, such as `en` or `eng`.
- `firstSeen:12h` or `firstSeen:7d` includes articles first seen within that many hours or days, plus articles that have never been seen.

Quote tag names containing spaces or query punctuation, for example
`tag:"read later"`. Tag matching uses the same trimmed, lowercase names as
article assignments.

### Scores

- `quality:>0.7` filters the computed 0–1 article-only Overall quality score; 0.7 equals 70/100 in the UI.
- `freshness:>=0.5` filters the computed 0–1 publication-time freshness score.

Both score filters accept `>`, `<`, `>=`, `<=`, or `=`. Omitting the operator uses `>=`, so `quality:0.7` means `quality:>=0.7`.

### Semantic and briefing filters

- `event:true` includes articles assigned to an event; `event:false` includes articles without an event.
- `eventCount:>=3` includes articles whose event has at least three articles. `eventCount:3` is the equivalent shorthand; other comparison operators are not supported.
- `developing:true` includes only unread articles selected as the developing, non-representative article for an event and forces event grouping with developing-event selection. `developing:false` excludes articles meeting that exact condition.
- `briefing:true` includes articles with a nonzero interest score or membership in an event containing more than one article. `briefing:false` includes articles with neither signal. Briefing preferences can further narrow results when the Briefing view invokes this filter.

### Sorting and limits

- `sort:desc` orders newest first; `sort:asc` orders oldest first.
- `sort:quality` is labeled **Quality & source trust** and orders by `70%` Overall quality and `30%` FeedTrust. It does not change the article-only quality filter.
- `sort:recommended` emphasizes personal interest, then freshness, Quality & source trust, corroboration, and an applicable rule-match boost.
- `sort:topStories` emphasizes current Event importance, freshness, and Quality & source trust without personal-interest input.
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
- Overall quality filters run after fetching, so they can reduce results even when the limit is higher.
- Recommended, Top Stories, and Quality & source trust rank the complete eligible candidate set before applying a result limit. They return a stable ordered ID collection for incremental loading rather than cursor-paginating an already limited SQL page.

---

## Combining Tokens

- Mix tokens freely: `title:ai tag:ml @yesterday sort:recommended limit:100`
- Title + content: `title:typescript decorators` -> title matches "typescript", content matches any of `decorators`.
- Status + date: `unread:true @today` keeps only unread items from the last 24 hours.

Use these expressions directly in the search bar or save them as Smart Folder
queries—the two features share the same syntax. See
[Smart Folders]({% link smart-folders.md %}) for instructions on creating and managing
saved views.
