---
layout: page
title: Saved and Opened Original Contract Migration
parent: How RSSMonster Works
---

# Saved and opened-original contracts

RSSMonster uses **Saved** for bookmarked articles and **Opened originals** for
recorded original-website openings. Both states remain independent of read/unread
status. Opening an original still increments a counter; marking it opened sets
that counter to at least one, and clearing it sets the counter to zero. An
automation rule can assign this state without an actual website visit.

## Canonical names

| Contract | Canonical name | Accepted legacy name |
| --- | --- | --- |
| Article save flag | `savedInd` | `favoriteInd` in API responses |
| Active save clock | `savedAt` | `favoritedAt` in API responses |
| Original-opening counter | `openedOriginalCount` | `clickedAmount` in API responses |
| Latest original-opening clock | `lastOpenedOriginalAt` | `lastClickedAt` in API responses |
| Selection/status value | `saved`, `openedOriginal` | `favorite`, `star`, `clicked` on input |
| Search expressions | `saved:true`, `openedOriginal:true` (also `false`) | `favorite:`, `star:`, `clicked:` boolean expressions |
| Overview counts | `savedCount`, `openedOriginalCount` | `favoriteCount`, `clickedCount` in API responses |
| Feed opening metrics | `feedOpenedOriginalAvg`, `feedOpenedOriginalRatio` | `feedClickAvg`, `feedClickRatio` in API responses |
| Save assignment | `set-saved` | `set-favorite` on input and existing receipt comparison |
| Automation types | `saved`, `openedOriginal` | `favorite`, `star`, `clicked` on input |
| Cleanup API protections | `neverDeleteSaved`, `neverDeleteOpenedOriginals` | `neverDeleteFavorites`, `neverDeleteClicked` on input/output |
| Cleanup database columns | `neverDeleteSaved`, `neverDeleteOpenedOriginalArticles` | Renamed physical columns; no duplicate legacy columns |
| Island signal counters | `saves`, `openedOriginals` | `stars`, `clicks` in serialized compatibility responses |
| Island source-audit IDs | `savedArticleIds`, `openedOriginalArticleIds` | `starredArticleIds`, `clickedArticleIds` in compatibility responses |
| MCP search flags | `saved`, `openedOriginal` | `favorite`, `clicked` |
| MCP tools | `saved_articles`, `search_opened_original_articles`, `tags_opened_original_articles` | `favorite_articles`, `search_clicked_articles`, `tags_clicked_articles` |

The interest inspector's evidence uses `saved` and `openedOriginals`; old
`favorites`/`clicks` properties remain additive response aliases. Compatibility
properties are projections of canonical state, not separately writable columns.
Canonical properties take precedence when clients normalize responses containing
both vocabularies. Mixing old and new search tokens retains the existing
last-token-wins behavior. Quoted text such as `title:"favorite:true"` is not renamed.

## HTTP routes

Canonical routes support the existing single/bulk payloads and ownership rules:

```text
POST /api/articles/mark-saved
POST /api/articles/mark-saved/:articleId
POST /api/articles/mark-opened-original
POST /api/articles/mark-opened-original/:articleId
```

`/markasfavorite` and `/markclicked`, including their `/:articleId` variants,
remain compatibility routes using the same handlers. New client requests use the
canonical routes. Legacy property aliases remain present in first-party JSON
responses and relevant MCP results.

The stored-article RSS endpoint accepts `saved=true` and retains `starred=true`.
Fever's `is_saved`/`saved` and Google Reader's `com.google/starred` state remain
unchanged because those are external protocol contracts.

## Existing databases and browser storage

Migration
[`20261012000000-standardize-saved-opened-original.mjs`](../server/migrations/20261012000000-standardize-saved-opened-original.mjs)
renames the four Article columns, two Feed metrics, and two cleanup columns. It updates persisted
selection statuses, automation types, synchronization receipt kinds, Smart Folder
queries, Generated Feed expressions, and Island signal/audit JSON. Expression
and JSON updates use bounded batches and preserve publication, interaction, and
record timestamps. Existing counters, ownership, receipt IDs and outcomes are
retained; unknown interaction times stay null.

The migration supports retries after a partial failure. It refuses a schema with
both old and new physical columns rather than guessing which data is authoritative.
SQLite uses native column renames to preserve indexes and foreign-key references.
Historical migration files and frozen semantic corpus/vector files keep their
original names. The semantic fixture loader maps legacy fields at its boundary.

For a self-hosted upgrade, stop the old application and workers, take a database
backup, and apply pending migrations using `npm run db` from `server/` with the
intended database configuration before starting the new code. Old processes
cannot use the renamed physical schema. Desktop uses its existing startup
migration runner. This migration's `down` intentionally requires restoring a
pre-upgrade backup rather than trying to reverse behavioral evidence and receipts.

The browser IndexedDB version advances from 2 to 3. Existing downloaded Article
records and queued `set-favorite` assignments are renamed inside the upgrade
transaction. Account scope, generations, action IDs, sequence, retries, base
values, and pending intent survive. The new server also accepts old save
assignments, so an action retried under its canonical kind remains a duplicate
rather than a second behavioral effect. New client API responses, selections,
Smart Folder expressions, and recent-search entries normalize legacy vocabulary.

## Personalization configuration

`ISLAND_SAVED_HALF_LIFE_DAYS` replaces `ISLAND_FAVORITE_HALF_LIFE_DAYS`, and
`ISLAND_OPENED_ORIGINAL_HALF_LIFE_DAYS` replaces `ISLAND_CLICK_HALF_LIFE_DAYS`.
Old variables remain fallback aliases when no valid canonical value is supplied.
Defaults, weighting, maximum counted evidence, thresholds, embeddings, and ranking
formulas are unchanged. No vector regeneration or semantic rebuild is required.

The engaged-vector maintenance CLI uses `--saved-and-opened-originals-only` and
retains `--stars-and-clicks-only` as an alias. This naming migration does not run
that maintenance operation.

## Compatibility regression coverage

- [Schema/data migration](../server/tests/migrations/articleStateContract.migration.test.js): MySQL/SQLite state, clocks, indexes, expressions, receipts, JSON and retry safety.
- [HTTP and action replay](../server/tests/controllers/articleSyncActions.test.js): old/new routes and save kinds share ownership checks and replay identity.
- [Client contracts](../client/tests/article-state-contract.test.js): legacy response normalization, canonical precedence, query aliases, quoted text and folder chips.
- [Native browser storage](../client/tests/browser/offline.html): version-2 downloads and pending saves preserve IDs, clocks, counters, retry state and account scope.

The full CI suites and the before/after semantic trace provide broader regression
coverage. Local semantic reports/vectors remain ignored and are not shipped.
