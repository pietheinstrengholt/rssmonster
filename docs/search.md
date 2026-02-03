# Search Guide

Find the right articles fast with a few expressive tokens. You can mix free text with filters; tokens override the UI status/sort settings.

---

## Quick Examples
- `javascript @today sort:IMPORTANCE` - fresh JavaScript stories ranked by importance
- `title:"rust async" unread:true` - title contains the exact phrase, only unread
- `tag:ai quality:>0.7 sort:QUALITY` - tagged items with high quality first
- `hot:true limit:50` - hottest 50 items (ignores feed filter)
- `cluster:true @yesterday` - one representative per cluster from yesterday

---

## Text Search Basics
- Unquoted words use AND across title/content: `rust borrow checker` requires all three words somewhere in title or body.
- Quotes match phrases: `"prompt injection"` matches that exact sequence in title or content.
- `title:keyword` searches only the title. If you also add free-text terms, the title must match and any of those terms may appear in content. Use `title:"exact phrase"` for an exact title phrase.

---

## Filters & Tokens
- Status: `unread:true|false`, `read:true|false`, `star:true|false`, `clicked:true|false`, `seen:true|false`, `hot:true|false` (hot ignores feed filter when true).
- Age: `firstSeen:24h` or `firstSeen:7d` (filters articles by how long ago they were first seen).
- Tags: `tag:my-tag` matches articles tagged for the current user.
- Clusters: `cluster:true|false` returns only cluster representatives when true.
- Quality & Freshness (virtual scores): `quality:>0.7`, `freshness:>=0.5` (operators: `>`, `<`, `>=`, `<=`, `=`; default is `>=`).
- Sort: `sort:DESC|ASC|IMPORTANCE|QUALITY|ATTENTION`. IMPORTANCE/QUALITY/ATTENTION are computed in memory after fetching.
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
- Quality/freshness filters run after fetching, so they can reduce results even when the limit is higher.

---

## Combining Tokens
- Mix tokens freely: `title:ai tag:ml @yesterday sort:ATTENTION limit:100`
- Title + content: `title:typescript decorators` -> title matches "typescript", content matches any of `decorators`.
- Status + date: `unread:true @today` keeps only unread items from the last 24 hours.

Use this guide inside the search bar and in Smart Folder queries - they share the same syntax.
