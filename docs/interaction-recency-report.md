# Article interaction timestamps and behavioral recency

Implemented on the current branch on 2026-09-14. Baseline commit:
`38f26233` plus the existing working-tree capacity and fixture edits.
Those two existing edits were preserved, as requested. No Event policy,
recommendation weight, signal weight or semantic threshold was retuned.

## Schema

`20260914001000-add-article-interaction-timestamps.mjs` adds five nullable
Sequelize DATE columns to `articles` and the Article model:

- `lastClickedAt`
- `favoritedAt`
- `positiveFeedbackAt`
- `negativeFeedbackAt`
- `lastMeaningfulReadAt`

The additive migration works on MySQL and SQLite. It retains all existing state,
indexes and references. It leaves legacy clocks null and tolerates retry after
partially completed DDL. It does not backfill migration time, create a history
table, or delete behavior. Rollback explicitly requires a pre-upgrade backup
rather than silently discarding the newly recorded timing evidence.

## Behavior write paths

| Path | Timing behavior |
| --- | --- |
| Normal `markclicked`, single and bulk | Increment counter and write `lastClickedAt` atomically; repeat clicks refresh time. |
| Normal click mark/unmark variant | Mark refreshes time while retaining the existing counter semantics; unmark clears counter and clock. |
| Normal `markasfavorite`, single and bulk | Favorite writes server time; unfavorite clears `favoritedAt`. |
| Normal `markmorelikethis` | Sets `positiveFeedbackAt` and positive flag, clears the opposite flag/clock in the same update. |
| Normal `marknotinterested` | Sets `negativeFeedbackAt` and negative flag, clears the opposite flag/clock in the same update. |
| `markasseen` with meaningful visible duration | Attention bucket calculation ≥3 refreshes `lastMeaningfulReadAt`, including already-seen articles. Existing firstSeen/bucket semantics remain. |
| Event read/seen cascade | Existing state propagation remains; the actual viewed article’s meaningful-read timestamp is not copied to unread siblings. |
| Fever saved/unsaved item mutations | Sets/clears `favoritedAt`, including the existing multi-ID mutation path. |
| GReader edit-tag starred mutations | Sets/clears `favoritedAt`; existing remove-wins behavior remains. |
| User-defined crawl favorite/star/click rules | Initial applied state carries its application time into article creation. |
| Feed reconciliation | Preserves the latest stored clock per signal when consolidating articles; merging is not a new interaction. |
| Publisher revisions | Interaction clocks are excluded from mutable source fields and remain unchanged. |

Client viewport tracking already sends `visibleSeconds`; no client behavior change
was needed. Simple read/unread actions, including Fever/GReader read state changes,
do not establish a meaningful read. MCP behavior lookup tools are read-only;
their descriptions no longer claim that these timestamps are unavailable, but no
new MCP date-filter contract was introduced. Ownership and canonical-article
filters remain in place.

## Island recency

`articleBehaviorTime.js` centralizes signal clocks and the matching SQL expressions.
Formation evaluates each positive term independently before adding them:

```text
8 × positive flag × decay(positiveFeedbackAt)
+ 4 × favorite flag × decay(favoritedAt)
+ 2 × min(clicks, 3) × decay(lastClickedAt)
+ 1 × deep-read flag × decay(lastMeaningfulReadAt)
```

The existing formation curve and floor remain unchanged. The existing −8
negative formation penalty remains undecayed; this task does not add a new decay
rule. Negative explicit fallback now uses `negativeFeedbackAt` for its existing
90-day window and 30-day half-life. Positive explicit fallback independently
checks positive feedback and favorite clocks, then retains the strongest positive
path as before rather than adding correlated contributions.

SQL applies the corresponding interaction windows and latest-active-interaction
ordering before the existing 500-current / 100-per-sign bounds. An old article
interacted with today can therefore enter bounded evidence selection. Confidence
retains its existing formula and uses interaction-day breadth; the diagnostic
field is now `distinctInteractionDays`. Publication-based content freshness,
Event occurrence logic and final Recommended calculation are unchanged.

## Legacy fallback

A null clock denotes behavioral state whose interaction time is unknown. Such
legacy state continues to use `publishedAt` for that signal, preserving the
previous approximation until a real mutation records its time. Known clocks
always override publication time. Neither migration execution nor source revision
manufactures a fresh interaction. Imported state lacking clocks has the same
limitation. Existing missing-date and future-date policies remain unchanged.

A 2022 article favorited today now has full fresh favorite evidence; an article
published today with an old known favorite time has decayed evidence. New focused
tests cover both, independent positive clocks, sign-specific fallback, expiration,
repeated clicks and reads, unfavorite, API variants, bounded SQL selection, source
revision preservation, reconciliation and both migration dialects.

## Before/after semantic comparison

Artifacts are preserved locally under
`server/tests/.semantic-regression/comparisons/interaction-recency/`, including
separate before/after snapshots, logs, fingerprints, exit statuses and
`comparison.json`. An initial attempt collided with a separate server test run;
its failed output is retained under `initial-collision` and was excluded from the
comparison. A fresh baseline was then captured after that process finished.

The model/vector caches and fixture fingerprints are identical before/after.
No vectors or feedback in the canonical corpus were regenerated. The corpus has
legacy null interaction clocks; these checks prove legacy equivalence, while the
new timestamp-specific tests prove the changed behavior.

| Measurement | Before | After |
| --- | --- | --- |
| Final articles / finite Recommended scores | 2,000 / 2,000 | 2,000 / 2,000 |
| Final positive / negative / neutral interest | 167 / 44 / 1,789 | 167 / 44 / 1,789 |
| Final Events / Eventless articles | 315 / 864 | 315 / 864 |
| Stored Islands after batch 1 / batch 2 | 20 / 25 | 20 / 25 |
| Trace test | Passed | Passed |
| Trace wall time | 157.05 s | 140.06 s |
| Gold tests | 65 passed, 8 failed | 65 passed, 8 failed |

Every per-article interest score, Recommended score and Event membership is
identical in both phases. All 160 designated held-out interest scores are
identical. Expected positives remain 60 positive, negatives 23 negative, neutrals
24 neutral, and emerging probes 12 neutral. This is a frozen offline comparison,
not a production experiment. Timing is one run per state, not a performance claim.

The eight gold failures have exactly the same failure locations before and after:
firmware-versions, model-identity, quake-regions, product-action, product-object,
english-french-incidents, press-release-rewrite and capacity-and-intent. They were
not skipped, weakened or counted as passing.

## Validation

| Check | Actual result |
| --- | --- |
| New API/recency tests plus existing feedback/profile tests | 4 files, 23 passed; 34.78 s |
| Broad relevant server suite, including MySQL migrations, Fever/GReader, Islands, reconciliation and persistence | 23 files, 288 passed, 2 existing TODOs; 166.10 s |
| Final revision/reconciliation preservation checks | 3 files, 59 passed; 29.05 s |
| Article authorization and ingestion checks | 2 files, 58 passed; 26.55 s |
| SQLite new migration and recency SQL tests | 2 files, 8 passed; 3.01 s |
| SQLite full-history fresh/upgrade plus new migration tests | 2 files, 4 passed; 7.90 s |
| Client suite | 136 files, 1,462 passed; 44.27 s |
| Server and client lint | Passed |
| Final `git diff --check` | Passed |

Test groups overlap; their totals must not be summed as unique tests. The final
semantic trace ran after the final behavior change. All database-mutating MySQL
runs were sequential after the initial external collision. SQLite used separate
file-backed test databases. No production migration, deployment, commit or push
was performed. No client source changed, so a client build was not rerun.

## Files changed by this task

- `docs/interaction-recency-report.md`
- `docs/interest-islands.md`
- `server/controllers/article.js`
- `server/controllers/fever.js`
- `server/controllers/greader.js`
- `server/controllers/mcp.js`
- `server/migrations/20260914001000-add-article-interaction-timestamps.mjs`
- `server/models/article.js`
- `server/services/articles/articleBehaviorTime.js`
- `server/services/crawl/enrichment/applyActions.js`
- `server/services/crawl/persistence/README.md`
- `server/services/crawl/persistence/buildArticlePersistenceValues.js`
- `server/services/crawl/persistence/saveArticle.js`
- `server/services/feeds/feedReconciliation.js`
- `server/services/islands/README.md`
- `server/services/islands/islandArticleProfiles.js`
- `server/services/islands/islandInterestConfidence.js`
- `server/tests/controllers/articleInteractionTime.test.js`
- `server/tests/crawl/applyActions.test.js`
- `server/tests/crawl/buildArticlePersistenceValues.test.js`
- `server/tests/crawl/updateArticle.test.js`
- `server/tests/feeds/feedReconciliation.integration.test.js`
- `server/tests/helpers/semanticRecommendationDiagnostics.test.js`
- `server/tests/helpers/semanticRegressionMarkdownReport.js`
- `server/tests/islands/interactionRecency.test.js`
- `server/tests/islands/islandArticleProfiles.test.js`
- `server/tests/migrations/articleInteractionTime.migration.test.js`
- `server/tests/migrations/topicRemoval.migration.test.js`

The pre-existing capacity edit in `server/services/islands/islandVectorUtils.js`
and text edit in `server/tests/fixtures/semantic-regression-batch002.json` are
preserved and excluded from the task file list above.
