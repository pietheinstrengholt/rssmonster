# Initial MySQL query performance indexes

Migration: `server/migrations/20260919002000-add-article-query-performance-indexes.mjs`.
It uses Sequelize `addIndex`/`removeIndex`, supports retry after partial DDL,
and removes only its three named indexes on rollback. Query results are unchanged.

## Query sources and index choices

| Profiled query | Source and implementation | Change |
| --- | --- | --- |
| Implicit deep-read evidence | `loadIslandEvidence` in `server/services/islands/islandInterestConfidence.js`, `implicitQuery('lastMeaningfulReadAt', ...)`, Sequelize `Article.findAll` | `articles_behavior_read_idx`: equality columns, then the read-time range, then attention bucket |
| Title substring search | `buildTextSearchWhereClause` in `server/services/articleSearch/articleTextSearch.service.js`, composed by `articleSearch.service.js`; `ciLike` in `server/utils/sequelize.utils.js` uses Sequelize `where`, `fn`, `col`, `Op.like` | Preserved intentional case-insensitive substring semantics |
| Read Top Tags | `getTags`, `topTagArticleWhere`, `applyTopTagGrouping` in `server/controllers/tag.js`, Sequelize `Article.findAll` with required Tag association | `articles_user_status_visible_event_idx` and `tags_user_article_name_idx` support visible read articles and owned tag joins |

Article/Tag models and existing migrations were inspected. Existing Article
indexes on `(userId, status, publishedAt)` and
`(userId, status, feedId, publishedAt)` diverge before the visibility columns.
The event index `(userId, eventId, publishedAt)` lacks the status/visibility
prefix. No existing index has the behavioral equality/read-time prefix.
Existing Tag indexes `(articleId, name)` (unique), `(userId, name)`, and `(name)`
do not provide `(userId, articleId, name)`. None is equivalent to the new indexes.
The Article model also declares `articles_user_status_visible_event_idx` so
model-synchronized databases support the Read Top Tags query described below.
The migration remains responsible for adding the indexes to existing databases.

The title contract is documented under “Title filter” in
`server/services/articleSearch/README.md`: both quoted and unquoted `title:`
filters use substring matching. For example, `title:ilk` must find `Silksong`.
Requiring a FULLTEXT token/prefix match would exclude such results; searching
both title and content alone would also admit body-only matches. The existing
FULLTEXT path for other search forms is unchanged. This title bottleneck remains
pending a separately agreed search contract or substring-search design.

The equivalent Sequelize title predicate remains:

```js
where(fn('LOWER', col('title')), { [Op.like]: '%silksong%' })
```

For the supplied profile, the equivalent SQL remains:

```sql
SELECT id FROM articles
WHERE LOWER(title) LIKE '%silksong%'
  AND userId = ? AND feedId IN (...)
  AND duplicateOfArticleId IS NULL AND filteredInd = false
  AND status = 'unread'
LIMIT 50;
```

Ownership, feed/status/visibility filters, COUNT(DISTINCT), tag ordering, and
event representative/developing-article predicates are unchanged. Effective-time
expressions and the `userId`/`id IN (...)` lookup are also unchanged. These are
physical access-path changes only, with no semantic scoring/architecture changes.

## Measured Read Top Tags follow-up

The existing composite indexes are installed in the local MySQL database, but
the default Read Top Tags plan still selects `articles_userId_idx`. The controller
now supplies Sequelize `indexHints` with `IndexHints.USE` and
`articles_user_status_visible_event_idx` only for MySQL requests with `status=read`.
This generates `FROM articles AS articles USE INDEX
(articles_user_status_visible_event_idx)`; MySQL may still choose a table scan.
All predicates, joins, distinct counting, grouping, ordering and limits remain
unchanged. Other statuses and dialects retain their existing query options.

Measured on September 19, 2026 using the actual controller-generated SQL for
the event-grouped read collection. Three interleaved SELECT executions per
version returned identical ordered names/counts. Session-local slow logging
captured server time and examined rows; no global logging setting was changed.

| Measurement | Before | After |
| --- | --- | --- |
| Server runtime, median | 522.787 ms | 366.061 ms |
| Server runtime, range | 506.337–575.860 ms | 355.085–386.225 ms |
| Slow-log rows examined per execution | 197,584 | 196,926 |
| Returned rows | 10 | 10 |
| EXPLAIN ANALYZE runtime | 592 ms | 412 ms |
| Article access | `articles_userId_idx`, full-row lookup | Covering `articles_user_status_visible_event_idx` |
| Article index rows visited | 93,471 | 93,029 |
| Event subquery loops | 2,339 | 2,123 |

The median improvement is about 30%, primarily from avoiding Article row fetches,
not a dramatic reduction in examined rows. The tag join still uses
`tags_articleId_name_unique`; grouping still processes 50,882 rows and 9,263 names.
No second hint or new index was introduced. The existing reversible migration
must be applied before deploying code that names its index. Roll back the code
before removing that index. Recheck this access-path choice as data distribution
changes; these local measurements are not a universal latency guarantee.

Remaining design work: computed behavioral timestamps still require bounded,
indexable evidence selection with legacy clock semantics; overview/briefing
counts still aggregate all-history collections; Recommended still materializes
large joined candidate sets. Title substring search retains its intentional
semantics. The reconstructed title-query hint was not generalized without
evidence across feed/date scopes. Deep-read evidence already uses its new index
and measured about 0.44 ms in the preceding audit, so no further change was made.

## Manual MySQL validation

Before applying, capture the exact affected SELECT statements from profiling,
including projections, event predicates, ordering, limits and parameter values.
On the same data and MySQL settings, save a baseline by prepending
`EXPLAIN ANALYZE` to each SELECT. Use a suitable diagnostic environment: the
statement executes the SELECT.

Apply through the existing migration runner with the intended database configured:

```bash
cd server
npm run db
```

This applies all pending migrations, so inspect pending work first. No application
database migration is applied as part of this code change.

```sql
SHOW INDEX FROM articles;
SHOW INDEX FROM tags;
```

Check `Key_name`, `Seq_in_index`, and `Column_name` for:

```text
articles_behavior_read_idx
  userId, positiveInd, negativeInd, favoriteInd, filteredInd,
  duplicateOfArticleId, lastMeaningfulReadAt, attentionBucket
articles_user_status_visible_event_idx
  userId, status, filteredInd, duplicateOfArticleId, eventId, id
tags_user_article_name_idx
  userId, articleId, name
```

Rerun `EXPLAIN ANALYZE` on the exact same captured SELECTs with the same values.
For example, after replacing the placeholders with the captured values:

```sql
EXPLAIN ANALYZE
SELECT id FROM articles
WHERE userId = <user_id>
  AND duplicateOfArticleId IS NULL AND filteredInd = false
  AND articleVector IS NOT NULL
  AND positiveInd = 0 AND negativeInd = 0 AND favoriteInd = 0
  AND attentionBucket >= 3
  AND lastMeaningfulReadAt BETWEEN '<window_start>' AND '<window_end>';
```

This minimal example checks the behavioral predicate; the full captured query
is needed to measure projection, ordering and limit costs. For Top Tags, keep
the captured event `EXISTS`/representative predicate verbatim, including whether
developing representatives are enabled. Do not benchmark a simplified join as
though it were the full query.

Compare chosen indexes/access paths, actual rows and loops at each iterator,
and total execution time over several runs with comparable cache conditions.
Compare result IDs/counts too; do not promise identical order for rows whose
query has no deterministic ordering. The indexes do not guarantee elimination
of expression sorting or tag aggregation sorting. Title substring scanning is
expected to remain. Record actual improvements before claiming a speedup.
