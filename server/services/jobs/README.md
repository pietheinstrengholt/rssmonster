# Processing Jobs

This directory owns RSSMonster's database-backed optional-work queue. Producers persist
identifier-only jobs in the same transaction as their owned target. The dedicated
`rssmonster-ai-worker` claims bounded batches and dispatches them through
`processingJobHandlers.js`. The SQLite Compose profile intentionally does not start an AI
worker; SQLite is the lightweight local-experimentation option, not the database-intensive AI
processing topology. A manually started SQLite AI worker always forces concurrency one. Use the
MySQL topology for background AI processing.

`processingJobQueue.js` owns enqueue, claim, lease, retry, completion, dead-letter, and expired
lease recovery transitions. `processingJobObservability.js` exposes aggregate operational
snapshots without reading payloads. `processingJobOperator.js` provides bounded, ownership-scoped
dead-job inspection and explicit requeue operations. Handlers must reload and revalidate owned
targets, use version guards before writes, remain idempotent, and never trust content in payloads.
The authenticated Settings cleanup deletes only owned `succeeded` and `dead` history; active and
cancelled jobs are retained. Settings retry requeues up to 100 owned dead jobs per request,
resetting the attempt budget and errors. Matching failed article versions return to pending in
the same transaction; stale jobs cannot reset newer article state. Active jobs are never reset.
The same retry action also recovers owned, unfiltered pending/processing articles without a pending
or running article-enrichment job, including articles whose old jobs succeeded without inference
or whose job history was cleared. Recovery uses current persisted tags/content and retained action
score overrides, only for analysis-enabled feeds. Dead retries and recovery share the 100-item
request limit. Article locking and an active-job recheck prevent concurrent recovery duplicates.
Status exposes these eligible articles separately as `summary.stranded`.

Optional processing must not move embeddings or deterministic semantic graph work out of the
crawl path. New job types belong in the handler registry and need focused lifecycle, ownership,
staleness, and retry tests.

Within the same explicit priority, claims prefer the newest job first. This makes newly ingested
articles visible with completed analysis before an older backlog is drained. A database-visible
crawl lease pauses new AI-worker claims while embedding and semantic graph work is active.

## Behavior-driven personalization refresh

Normal Article actions and Fever/GReader favorite mutations use
`articles/updateArticleBehavior.js` to commit behavior and a `personalization_refresh`
job together. Favorite/unfavorite, explicit positive/negative feedback, clicks and
observed deep reads request a refresh. Read-state toggles alone do not.

There is one reusable job per user. A two-second window from the first request
coalesces pending actions without letting continuous activity postpone work forever.
A request identifier changes with each write. Completion checks it under a row lock:
activity during execution leaves one pending follow-up; otherwise the job succeeds.
New activity reactivates terminal jobs. Existing leases, retries, dead-job reporting
and Settings retry remain in effect. User locks serialize producers, and the job
lease prevents two workers from claiming the same active refresh. SQLite uses an
immediate write transaction because it does not support row locks.

The existing AI worker dispatches `runIslandCalibrationForUser`, which recalibrates
only the job owner and rescores their unread, canonical, unfiltered Articles in
batches of 200. Eligibility is checked again when each score is written. Events and
recommendation mathematics are unchanged. Refresh jobs have priority 10 and respect
the worker's crawl-priority pause. They do not call inference for calibration;
behavior-driven calibration does not enqueue generated-label inference jobs.

The worker must be running. Recommended reflects the updated scores on the next
fetch after the job completes, without requiring a crawl. An immediate fetch during
the batching window can still see previous scores; no HTTP request waits for
calibration. The SQLite Compose profile does not start this worker automatically.

## Fast explicit feedback versus durable calibration

`more-like-this` and `not-interested` additionally enqueue an
`explicit_feedback_refresh` job in the behavior transaction. It is immediately
eligible, with priority 20 ahead of durable calibration's priority 10, and has no
two-second delay. Repeated feedback on the same article reuses one job; an action
during execution requests an immediately eligible follow-up using the existing
request-identifier completion guard. The handler reloads current owned, canonical,
unfiltered source state, so an older queued positive action cannot replay an old
sign after a newer negative action.

This fast job calls the existing scoring service with a source-article scope. It
uses the unchanged explicit positive/negative fallback, Island confidence, intent
attenuation and path deduplication. It neither builds Islands nor alters weights.
Eligible unread candidates qualify by similarity to the source vector or an active
Island whose support that source can affect, using the existing thresholds. Other
candidates keep their persisted scores. Missing source vectors produce no fast work.

There is no indexed vector-neighbor lookup in the current persistence layer. The
worker scans eligible owned articles in batches of 200, but evaluates and writes
only the related subset. This bounds memory and avoids full-library rescoring; it
does not promise constant-time candidate discovery.

Favorites remain strong explicit fallback evidence under the existing evaluator,
and favorite/unfavorite continue requesting durable calibration. They do not
schedule this extra fast job. Clicks and deep reads likewise retain the durable
path. Recommended sees fast results on the next fetch after the worker finishes;
HTTP responses do not wait for scoring, and worker availability/crawl pauses still
apply. The durable job subsequently updates long-lived Islands and all eligible
unread scores through the existing calibration flow.

## Conservative scoping and replay

Full calibration still needs all existing eligible behavioral evidence for the
changed user. Greedy magnitude ordering, centroid changes, shared capacity, matching
and archival can affect other Islands; an arbitrary recent-history limit or local
Island rebuild would change semantics. Formation already performs the authoritative
magnitude/Article-ID sort in memory, so its redundant SQL sort has been removed.
No Article vectors are regenerated and no Event processing is invoked.

Durable refresh retains complete unread-user scoring because new/removed Islands,
confidence changes and explicit-fallback suppression can affect candidates outside
the last interacted article's neighborhood. The explicit fast path retains its
existing source/Island scope. Both paths suppress writes when the evaluated score
already equals its stored representation, including MySQL's single-precision FLOAT
round-trip. They do not use an approximate similarity or recommendation tolerance.

A calibration checkpoint is committed to the job payload in the same transaction
as Island persistence. If scoring fails afterwards, retry reuses that calibration
and completes scoring instead of blending vectors and appending evidence again.
A new behavior request has a new identifier and requires its own calibration;
requests received during execution retain the existing follow-up behavior. If the
checkpoint cannot commit, the Island changes roll back too. This is request-scoped
replay protection, not a cross-request semantic cache.

Each completed pass emits `[PERSONALIZATION REFRESH]` JSON with `triggerReasons`,
`userId`, `jobId`, `type`, `calibrationDurationMs`, `islandsChanged`,
`candidatesRescored`, `interestScoresChanged`, and `calibrationReused`.
`islandsChanged` counts differences in persisted vectors, weights, signal snapshots
and archival state, including additions/removals; presentation labels and audit
metadata are excluded. Candidate counts include neutral evaluations. Score-change
counts include only successful eligible updates. A checkpoint replay reports zero
new calibration time/Island changes. Fast skips report their reason and zero work.

The two-second per-user coalescing window remains anchored to the first pending
request, so a burst produces one durable refresh without starving continuous users.
Fast explicit jobs retain their immediately eligible behavior. Replaying a claimed
job still requires its live lease; completing a scoring retry cannot consume a newer
behavior request accidentally.
