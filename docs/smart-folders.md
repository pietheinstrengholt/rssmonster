---
layout: page
title: Smart Folders
---

## What Are Smart Folders?

Smart Folders are **declarative, dynamic views** built using search expressions.

They update automatically as new articles arrive.

![Screenshot](client/src/assets/screenshots/screenshot03.png)

---
## How They Work
- Each Smart Folder stores a search expression (same syntax as the [Search Guide](search.md)).
- Results refresh continuously as new items match the query.
- Limit: each folder returns up to `limitCount` articles (default 50).
- Sorting respects the query (`sort:IMPORTANCE`, `sort:QUALITY`, `sort:ATTENTION`, `sort:DESC|ASC`).

---

## Create a Smart Folder
1. Open **Smart Folders** in the app.
2. Add a name and a search expression.
3. (Optional) Set `limitCount` to cap results (50 by default).
4. Save. The folder updates itself as content changes.

Use the same tokens as the search bar: status (`unread:true`, `star:true`), tags (`tag:news`), dates (`@today`, `@"3 days ago"`), quality/freshness (`quality:>0.7`), cluster view (`cluster:true`), and sorts.

---

## Recipes
- Top stories today: `@today unread:true cluster:true sort:IMPORTANCE limit:100`
- High-quality long reads: `quality:>0.75 sort:QUALITY unread:true`
- Engaged items: `sort:ATTENTION clicked:true limit:80`
- Hot right now: `hot:true sort:ATTENTION`
- Topic by tag: `tag:ai unread:true sort:IMPORTANCE`
- Fresh and non-duplicate: `@yesterday cluster:true sort:IMPORTANCE`

---

## Tips
- Add `cluster:true` to collapse duplicate coverage into one representative per story.
- Combine status with time to keep the list focused: `unread:true @today`.
- Use `quality:>=0.7` or `freshness:>=0.5` to filter after fetch; they can shrink the result set even if the limit is higher.
- If you omit status but include text, all statuses are searched; add `unread:true` or `read:true` if you want to constrain.

---

## AI Suggestions (Optional)
- When `OPENAI_API_KEY` is set on the server, RSSMonster can propose Smart Folders from your reading patterns (feeds, tags, starred items).
- Suggestions follow the same search syntax and avoid duplicating your existing folders.