# Search Guide

Find the right articles fast with a few expressive tokens. You can mix free text with filters; tokens override the UI status/sort settings.

---

## Quick Examples
- `javascript @today sort:recommended` - fresh JavaScript stories ranked by recommended score
- `title:"rust async" unread:true` - title contains the exact phrase, only unread
- `tag:ai quality:>0.7 sort:quality` - tagged items with high quality first
- `hot:true limit:50` - hottest 50 items (ignores feed filter)

---

## Text Search Basics
- Unquoted words use AND across title/content: `rust borrow checker` requires all three words somewhere in title or body.
- Quotes match phrases: `"prompt injection"` matches that exact sequence in title or content.
- `title:keyword` searches only the title. If you also add free-text terms, the title must match and any of those terms may appear in content. Use `title:"exact phrase"` for an exact title phrase.

---

## Filters & Tokens
- Status: `unread:true|false`, `read:true|false`, `favorite:true|false`, `clicked:true|false`, `seen:true|false`, `hot:true|false` (hot ignores feed filter when true).
- Age: `firstSeen:24h` or `firstSeen:7d` (filters articles by how long ago they were first seen).
- Tags: `tag:my-tag` matches articles tagged for the current user.
- Quality: `quality:>0.7` (operators: `>`, `<`, `>=`, `<=`, `=`; default is `>=`).
- Freshness: `freshness:>=0.5` (operators: `>`, `<`, `>=`, `<=`, `=`; default is `>=`).
- Events: `event:true` shows articles that belong to an event; `event:false` shows articles that are not assigned to any event.
- Event size: `eventCount:>=3` keeps articles whose event has at least 3 articles. `eventCount:3` is accepted as the same minimum-count shorthand.
- Sort: `sort:desc|asc|recommended|quality|attention`. Recommended, quality, and attention sorts are computed in memory after fetching.
- Limit: `limit:50` caps results (overrides defaults).

---

## Date Filters
- Specific day (UTC): `@2025-12-14`
- Rolling window: `@today` (last 24h)
- Previous UTC day: `@yesterday`
- Previous 7 days: `@lastweek`
- Exact N days ago (UTC day): `@"3 days ago"`
- Most recent weekday: `@"last Monday"`

Date filters replace the normal published-date window; they are inclusive of the whole day when applicable.

---

## Defaults & Limits
- If you provide search text, RSSMonster searches **all statuses** unless you add a status token. Without search text it defaults to unread.
- When any search expression is used and no `limit` is provided, results are capped at 500 after sorting. Smart folders may apply their own limits.
- Quality filters run after fetching, so they can reduce results even when the limit is higher.

---

## Combining Tokens
- Mix tokens freely: `title:ai tag:ml @yesterday sort:attention limit:100`
- Title + content: `title:typescript decorators` -> title matches "typescript", content matches any of `decorators`.
- Status + date: `unread:true @today` keeps only unread items from the last 24 hours.

Use this guide inside the search bar and in Smart Folder queries - they share the same syntax.
