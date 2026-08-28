# Processing Jobs

This directory owns RSSMonster's database-backed optional-work queue. Producers persist
identifier-only jobs in the same transaction as their owned target. The dedicated
`rssmonster-ai-worker` claims bounded batches and dispatches them through
`processingJobHandlers.js`. The SQLite Compose profile retains the earlier combined-worker mode
with concurrency one to keep its small deployment topology unchanged.

`processingJobQueue.js` owns enqueue, claim, lease, retry, completion, dead-letter, and expired
lease recovery transitions. `processingJobObservability.js` exposes aggregate operational
snapshots without reading payloads. `processingJobOperator.js` provides bounded, ownership-scoped
dead-job inspection and explicit requeue operations. Handlers must reload and revalidate owned
targets, use version guards before writes, remain idempotent, and never trust content in payloads.

Optional processing must not move embeddings or deterministic semantic graph work out of the
crawl path. New job types belong in the handler registry and need focused lifecycle, ownership,
staleness, and retry tests.

Within the same explicit priority, claims prefer the newest job first. This makes newly ingested
articles visible with completed analysis before an older backlog is drained. A database-visible
crawl lease pauses new AI-worker claims while embedding and semantic graph work is active.
