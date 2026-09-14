# Behavior-driven personalization refresh

Meaningful behavior commits a durable refresh request in the same transaction as
its Article update. Normal favorite/unfavorite, positive/negative feedback, clicks,
and observed deep reads are covered, including bulk writes. Fever saved/unsaved
and GReader starring use the same helper. Read-state toggles alone do not request
calibration. MCP exposes no behavior mutation endpoint.

One reusable `personalization_refresh` job per user coalesces actions during a
two-second window anchored to the first request. New actions do not postpone that
deadline. A request identifier records activity during execution; completion checks
it under a lock and leaves one pending follow-up when needed. Terminal jobs can be
reactivated by later behavior. Existing leases, retries, recovery and Settings
failure controls apply. Follow-up scheduling counts as a successful worker pass.

The existing AI worker calls `runIslandCalibrationForUser`. Its existing scorer
refreshes only the owner's unread, canonical, unfiltered candidates, in batches of
200; score writes recheck eligibility. Articles without matching evidence still
receive neutral interest. Unfavoriting reduces current support without deleting
durable Island memory. Events, formation rules, thresholds and recommendation
weights are unchanged. No new schema or semantic layer was introduced.

The worker must run for background refreshes. Recommended reflects updated scores
on the next fetch after completion; a fetch during the batching window may still
see earlier scores. Refreshes respect the worker's existing crawl pause. SQLite
uses immediate write transactions and requires a manually started AI worker with
the current SQLite Compose profile.

## Validation

- Final behavior/API/worker tests: 18 passed on MySQL.
- SQLite refresh tests: 5 passed; 1 MySQL-specific completion-race test skipped
  because SQLite serializes writers before that race can occur.
- Broader compatibility/scoring/worker tests: 170 passed, 2 existing TODOs.
- Queue operation/Settings/refresh checks: 29 passed.
- Server lint and diff whitespace checks passed. No client code changed.
- Semantic gold: 65 passed, 8 known failures. The failures are firmware-versions,
  model-identity, quake-regions, product-action, product-object,
  english-french-incidents, press-release-rewrite, and capacity-and-intent.
  These match the previously recorded failures; no fresh pre-change full gold
  run was performed for this scheduling change.

Both fresh semantic traces passed with the same fixture digest. Processing time: 106.67s before, 101.26s after. All phase metrics, article rows/scores, Event memberships, Island snapshots, and 160 held-out results are identical.

Logs, snapshots and the machine-readable comparison are retained in
`server/tests/.semantic-regression/comparisons/personalization-refresh/`.

## Files changed for this task

| File | Change |
| --- | --- |
| [server/controllers/article.js](../server/controllers/article.js) | Single/bulk favorite and click actions, explicit feedback, and deep reads use the transactional helper. |
| [server/controllers/fever.js](../server/controllers/fever.js) | Saved/unsaved item, feed, and group writes use the same helper. |
| [server/controllers/greader.js](../server/controllers/greader.js) | Star/unstar writes use the same helper. |
| [server/services/articles/updateArticleBehavior.js](../server/services/articles/updateArticleBehavior.js) | Atomic behavior persistence and refresh requests; serialized producers on MySQL and SQLite. |
| [server/services/jobs/personalizationRefresh.js](../server/services/jobs/personalizationRefresh.js) | One reusable per-user job, two-second coalescing, calibration handler, and guarded completion. |
| [server/services/jobs/processingJobHandlers.js](../server/services/jobs/processingJobHandlers.js) | Job registration, user failure attribution, and successful follow-up reporting. |
| [server/services/score/scoreArticlesFromIslands.js](../server/services/score/scoreArticlesFromIslands.js) | Recheck ownership and unread/canonical/unfiltered eligibility when writing scores. |
| [server/tests/services/personalizationRefresh.test.js](../server/tests/services/personalizationRefresh.test.js) | End-to-end scoring, burst coalescing, follow-ups, completion races, ownership, rollback, and retries. |
| [server/tests/controllers/articleInteractionTime.test.js](../server/tests/controllers/articleInteractionTime.test.js) | Normal/Fever/GReader behavior mutations assert one pending refresh job. |
| [server/services/jobs/README.md](../server/services/jobs/README.md) | Queue lifecycle, scheduling, and worker requirements. |
| [docs/interest-islands.md](../docs/interest-islands.md) | User-facing behavior refresh timing. |
| `docs/personalization-refresh-report.md` | This implementation and validation record. |

Existing Topic-removal, interaction-timestamp, capacity and fixture edits were preserved.
