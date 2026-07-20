---
layout: page
title: Smart Folders
---

## What Are Smart Folders?

Smart Folders are **declarative, dynamic views** built using search expressions.

They update automatically as new articles arrive.

![Screenshot](/rssmonster/assets/screenshot03.png)

---
## How They Work
- Each Smart Folder stores a search expression (same syntax as the [Search Guide](search.md)).
- Results refresh continuously as new items match the query.
- Limit: each folder returns up to `limitCount` articles (default 50).
- Sorting respects the query (`sort:trust`, `sort:recommended`, `sort:quality`, `sort:attention`, `sort:desc|asc`).

---

## Create a Smart Folder
1. Open **Smart Folders** in the app.
2. Add a name and a search expression.
3. (Optional) Set `limitCount` to cap results (50 by default).
4. Save. The folder updates itself as content changes.

Use the same tokens as the search bar: status (`unread:true`, `favorite:true`), tags (`tag:news`), dates (`@today`, `@"3 days ago"`), quality (`quality:>0.7`), freshness (`freshness:>=0.5`), event grouping (`event:true`, `eventCount:>=3`), interest-island applicability (`island:true`, `island:false`), hot items (`hot:true`), and sorts.

---

## Recipes
- Top stories today: `@today unread:true sort:recommended limit:100`
- High-quality long reads: `quality:>0.75 sort:quality unread:true`
- Engaged items: `sort:attention clicked:true limit:80`
- Trusted sources: `sort:trust unread:true limit:80`
- Hot right now: `hot:true sort:attention`
- Events with broad coverage: `event:true eventCount:>=3 sort:recommended`
- Interest-aligned events: `event:true island:true sort:recommended`
- Articles outside active interests: `island:false sort:desc`
- Topic by tag: `tag:ai unread:true sort:recommended`
- Yesterday's highlights: `@yesterday unread:true sort:recommended`

---

## Tips
- Combine status with time to keep the list focused: `unread:true @today`.
- Use `quality:>=0.7` to filter after fetch; it can shrink the result set even if the limit is higher.
- Use `event:true` for a low-noise event view. Add `eventCount:>=3` when you only want events with broad coverage.
- Use `island:true` when an event must connect through any assigned topic to one of your active interest islands. Archived islands do not count.
- If you omit status but include text, all statuses are searched; add `unread:true` or `read:true` if you want to constrain.

---

## AI Suggestions (Optional)
- When `OPENAI_API_KEY` is set on the server, RSSMonster can propose Smart Folders from your reading patterns (feeds, tags, starred items).
- Suggestions follow the same search syntax and avoid duplicating your existing folders.
