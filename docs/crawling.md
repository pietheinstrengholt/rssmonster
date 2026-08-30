---
layout: page
title: Crawling
parent: Administration
nav_order: 2
---

# Crawling

RSSMonster's crawler keeps subscribed feeds current and passes new or revised
articles into the semantic processing pipeline. A normal crawl iteration:

1. loads users in bounded batches;
2. claims each user's feeds that are due according to `nextFetchAt`;
3. fetches, validates, and parses each claimed feed;
4. resolves article identity and revisions before duplicate detection;
5. normalizes and sanitizes content, applies rules, and persists articles;
6. records the feed outcome and calculates its next fetch time; and
7. embeds touched articles, updates Events and Topics, and refreshes Interest
   Island scores for affected users.

Repeated runs are expected. Stable publisher IDs, normalized URLs, duplicate
checks, crawl-run guards, and feed leases make ingestion idempotent and prevent
the same due work from being processed concurrently.

## Scheduling Due Feeds

`nextFetchAt` is the scheduling authority. A feed is eligible only when that
time has arrived. The next time is derived from publisher activity, configured
update cadence, cache headers, `Retry-After`, failure classification, backoff,
and deterministic jitter. An HTTP `304` or unchanged response is successful
and skips parsing and article processing.

`FEED_MAX_COUNT` limits how many feeds one crawl invocation claims for one
user; the default is `10`. The scheduled all-user pipeline therefore processes
up to that many due feeds per user during each iteration. A later worker poll
claims the next due batch.

The dedicated worker waits `CRAWL_WORKER_INTERVAL_MS` after an iteration has
finished before starting the next one. It defaults to 60,000 ms. This is a
delay between complete runs, not a timer that interrupts an active run, so a
slow iteration cannot overlap the next iteration in the same worker.

## Sequential and Parallel Modes

By default, RSSMonster processes feeds sequentially:

```env
CRAWL_PARALLELPROCESSFLAG=0
```

For MySQL, set the flag to `1` to enable parallel feed workers. The number of
simultaneous feed workers is bounded by `FEED_PARALLEL_CONCURRENCY`, which
defaults to `3`:

```env
CRAWL_PARALLELPROCESSFLAG=1
FEED_PARALLEL_CONCURRENCY=3
```

Parallel workers claim feeds one at a time just before processing them. A
process-wide slot pool also bounds concurrent feeds when multiple user crawls
are active. `CRAWL_USER_BATCH_SIZE` controls how many users the scheduled
pipeline crawls concurrently and defaults to `5` on MySQL.

SQLite deliberately overrides these settings: feeds are sequential, user
batch size is `1`, and feed concurrency is capped at `1`. Do not try to force
parallel crawling on SQLite. With MySQL, increase concurrency gradually while
watching connection usage, crawl duration, timeouts, publisher rate limits,
and embedding-provider limits.

## Limits and Safety Controls

The principal execution controls are:

| Variable | Default | Purpose |
| --- | ---: | --- |
| `FEED_MAX_COUNT` | `10` | Due feeds claimed per user and crawl invocation. |
| `CRAWL_USER_BATCH_SIZE` | `5` | Users crawled concurrently on MySQL; SQLite uses `1`. |
| `CRAWL_PARALLELPROCESSFLAG` | `0` | Enable parallel feed processing on MySQL when set to `1`. |
| `FEED_PARALLEL_CONCURRENCY` | `3` | Maximum simultaneous feed workers in the process. |
| `FEED_TIMEOUT_MS` | `60000` | Complete processing deadline for one feed. |
| `FEED_LEASE_MS` | `120000` | Feed-claim lease; the effective value is at least twice the feed timeout. |
| `CRAWL_TIMEOUT_MS` | `600000` | Overall deadline for one user's crawl invocation. |
| `CRAWL_RUN_HEARTBEAT_INTERVAL_MS` | `30000` | Renewal interval for an active per-user crawl run. |
| `CRAWL_RUN_STALE_AFTER_MS` | `120000` | Missing-heartbeat age at which a crawl run is considered stale; effectively at least three heartbeat intervals. |
| `CRAWL_WORKER_INTERVAL_MS` | `60000` | Delay between complete worker iterations. |
| `PROCESSING_JOB_POLL_INTERVAL_MS` | `1000` | Delay between optional-job polls with no available work. |
| `PROCESSING_JOB_CONCURRENCY` | `1` | Optional jobs executed concurrently; a manually started SQLite AI worker always uses `1`. |
| `PROCESSING_JOB_SHUTDOWN_TIMEOUT_MS` | `30000` | Grace period for in-flight optional jobs during shutdown. |
| `PROCESSING_JOB_REPORT_INTERVAL_MS` | `60000` | Interval for structured optional-queue operational snapshots. |
| `CRAWL_PRIORITY_LEASE_MS` | `90000` | Renewable database lease used to pause new AI claims during the critical semantic pipeline. |
| `CRAWL_PRIORITY_HEARTBEAT_MS` | `30000` | Crawl-priority lease renewal interval. |
| `CRAWL_VERBOSE_LOGGING` | `false` | Include candidate, retry, and discovery diagnostics in crawl logs. |

Additional response-size, parser, HTTP, per-origin, retry, and article-field
limits are documented in [Configuration](configuration.md#feed-crawling-and-scheduling).

### Overlap protection

RSSMonster uses two database-backed layers of protection:

- A per-user active crawl-run constraint prevents a scheduled and API-triggered
  crawl from running for the same user at the same time. A duplicate trigger
  becomes a no-op. Active runs renew an ownership heartbeat; runs missing that
  heartbeat for `CRAWL_RUN_STALE_AFTER_MS` are marked failed so work can recover
  after a crashed process.
- Each due feed is claimed with an expiring lease. Active work renews that lease,
  and persistence checks ownership before writing. This protects against
  overlap across worker processes and hosts that share the same database.

Use exactly one scheduled worker in normal operation. The database safeguards
prevent duplicate processing, but extra workers still add polling and database
load.

## Running One Crawl

From `server`, run one all-user incremental pipeline and exit:

```bash
npm run crawl
```

Authenticated users can also trigger their own crawl through the application.
The `GET /api/crawl` endpoint starts that user's crawl asynchronously, while
the feed-refresh API provides progress events for the web interface. A manual
trigger follows the same run guard and feed-lease rules as the scheduled
worker.

## Running the Workers

For a direct foreground process:

```bash
cd server
npm run start:worker
```

Run the optional-job consumer separately for MySQL or a manual split topology:

```bash
cd server
npm run start:ai-worker
```

Each process authenticates its own Sequelize connection set. On `SIGINT` or
`SIGTERM`, the crawl worker waits for its active crawl and the AI worker stops
claiming, interrupts its poll, and waits up to
`PROCESSING_JOB_SHUTDOWN_TIMEOUT_MS` for in-flight work. Remaining handlers are
signalled to abort and their fenced leases can recover after expiry. Each
process closes its own database connections once.

The lightweight SQLite Compose topology starts only the crawl worker and keeps
AI processing disabled. It does not consume optional processing jobs.

The web process does not schedule this loop. Keeping the crawler separate
means a long crawl cannot prevent PM2 from supervising and restarting the web
application independently.

## PM2 Production Setup

The root `ecosystem.config.cjs` defines separate web, crawl, AI-worker, and
inference processes:

- `rssmonster-web` runs `server/bootstrap.js`;
- `rssmonster-worker` runs `server/src/workers/crawlWorker.js` as one fork-mode
  instance and does not consume optional jobs;
- `rssmonster-ai-worker` runs `server/src/workers/aiWorker.js` as one fork-mode
  instance and consumes `processing_jobs`;
- `rssmonster-inference` runs `inference/src/index.js` as one fork-mode
  instance; see [Inference](inference.md).

From the repository root, start or reload all processes with the production
environment:

```bash
pm2 startOrReload ecosystem.config.cjs --env production --update-env
pm2 save
pm2 status rssmonster-web rssmonster-worker rssmonster-ai-worker rssmonster-inference
```

Useful operational commands include:

```bash
pm2 logs rssmonster-worker
pm2 logs rssmonster-ai-worker
pm2 restart rssmonster-worker --update-env
pm2 restart rssmonster-ai-worker --update-env
pm2 describe rssmonster-worker
pm2 describe rssmonster-ai-worker
```

The crawl worker's PM2 shutdown timeout is intentionally long so an in-progress
crawl can finish before PM2 terminates it. The AI worker has a bounded shutdown
grace for leased work. The ecosystem file contains no secrets; all server
processes load `server/.env`.

After enabling the worker, disable any OS cron job that calls `/api/crawl` or
runs `npm run crawl`. Leaving both schedulers enabled creates redundant crawl
attempts. If an older installation still has the obsolete `rssmonster-dev` PM2
process, inspect it and remove it once:

```bash
pm2 delete rssmonster-dev
pm2 save
```

Keep one scheduled crawl worker. MySQL can safely run more than one AI-worker
instance because claiming uses transactional row locks with `SKIP LOCKED`, but
start with one process and increase `PROCESSING_JOB_CONCURRENCY` gradually.

## Monitoring and Troubleshooting

The worker logs iteration start, completion, duration, and failures. Each feed
also records its last outcome, diagnostic state, failure count, next fetch
time, and crawl history. Feed observability and crawl statistics are available
from the Settings interface.

Every `PROCESSING_JOB_REPORT_INTERVAL_MS`, the AI worker collects a structured
`processing_jobs.snapshot` and includes the latest object in its own health
file without writing the periodic snapshot to standard output. It contains
pending counts by type, oldest pending age, running and
retry counts, dead and successful completion counts, and a bounded recent
processing-latency sample. Per-job lifecycle events contain the job ID, type,
attempt, user ID, and only safe article or semantic target identifiers. Payloads,
article text, and inference prompts are never logged. Retry, dead-letter, lease
loss, and expired-lease recovery outcomes are also retained in processing
failure observability when an owned target is available.

Authenticated clients can read the same user-scoped operational view from
`GET /api/setting/processing-jobs`. The response includes worker availability,
queue totals, per-job-type backlog, bounded recent completion latency, and at
most ten safe dead-job summaries. It never includes payloads, deduplication
keys, lease owners, prompts, or article content. The supplied Compose profiles
share only the worker health file with the web container; queue data remains in
the configured database. Retained dead jobs remain visible in the totals and
failure list, but only a dead job from the most recent 60 minutes degrades an
otherwise healthy queue.

`DELETE /api/setting/processing-jobs` permanently removes only the authenticated
user's `succeeded` and `dead` job records. Pending, retrying, running, cancelled,
and other users' jobs remain untouched.

When feeds fall behind, check:

1. `pm2 status rssmonster-worker` and the crawl-worker logs;
2. database connectivity and pending migrations;
3. whether feeds have a future `nextFetchAt` because of cache policy, backoff,
   or `Retry-After`;
4. timeouts, parser limits, and per-origin throttling;
5. whether concurrency is too high for the database or provider limits; and
6. whether a stale crawl run or expired feed lease is recovering.

Verbose crawl logging can help with discovery and retry diagnosis, but it is
noisier and should normally remain disabled.

## Durable Optional Processing Queue

Article enrichment and generated Event, Topic, and Island presentation labels
are optional database-backed jobs. Article rows and their enrichment jobs are
committed atomically. Job payloads contain identifiers and version guards, not
article content. Handlers reload the current owned target before inference and
lock and recheck it before persistence. A newer article revision therefore
cannot be overwritten by an older job. Article enrichment replaces only
inferred tags; provider, feed, rule, manual, and unknown tag provenance remains
intact.

Jobs move through these states:

- `pending`: available now or after the recorded backoff time;
- `running`: claimed by one lease owner until `leaseUntil`;
- `succeeded`: completed or safely obsolete;
- `dead`: failed terminally or exhausted `maxAttempts`; and
- `cancelled`: explicitly excluded from future claims.

Availability is an eligibility gate. Claims are ordered by explicit priority,
then newest creation time, then stable ID, so recent articles are analyzed
before an older same-priority backlog. Each claim
increments `attempts`. Retryable failures use bounded exponential backoff with
jitter; the fifth attempt is terminal by default. Active handlers renew their
lease during long inference. Succeeded and dead records are retained for
deduplication and operational history; they are not deleted on completion.
Completion, retry, and dead-letter updates require
the same user, lease owner, running state, and unexpired lease. On startup the
worker performs one bounded recovery pass for expired running leases. An
expired final attempt is dead-lettered; otherwise the job becomes claimable
again.

SQLite uses a one-connection pool, so a manually started AI worker always
forces optional concurrency to one regardless of configuration. The SQLite
Compose profile deliberately does not start that process: SQLite is the
lightweight local-experimentation option and is not intended for
database-intensive background AI processing. This omission is an architectural
constraint, not an incomplete deployment topology. MySQL uses
`rssmonster-ai-worker` and transactional row locks with
`SKIP LOCKED`, so multiple AI workers sharing the database claim disjoint jobs.
Increase `PROCESSING_JOB_CONCURRENCY` gradually while watching database, CPU,
memory, and inference capacity. Optional claims pause while any scheduled,
manual, or API-triggered critical pipeline has an active holder row in
`worker_leases`; concurrent crawls do not exclude one another.
Embeddings still complete before Event creation, Topic assignment, and Island
scoring, and optional inference failures cannot fail that deterministic path.

Deploy the schema migration that creates `worker_leases` before starting the
split workers. If the crawl process exits unexpectedly, the lease expires and
AI claiming resumes without an operator repair.

### Dead-job recovery

First list a bounded set for one explicit owner. The command never prints job
payloads and lists at most 100 rows:

```bash
cd server
npm run jobs:operator -- list-dead --user-id 42 --type article_enrichment --limit 20
```

After inspecting the output and correcting the underlying issue, requeue exact
job IDs. Requeue requires both the owner and one or more IDs, resets their
attempt counter, and only changes matching `dead` rows:

```bash
npm run jobs:operator -- requeue-dead --user-id 42 \
  --job-id 11111111-1111-4111-8111-111111111111
```

The operator command performs no automatic scan, unbounded repair, migration,
or semantic rebuild. Requeued handlers still enforce ownership, eligibility,
and version guards, so obsolete work completes without overwriting current
state.
