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
| `CRAWL_RUN_MAX_RUNNING_MINUTES` | `60` | Age at which an unfinished per-user crawl run is considered stale. |
| `CRAWL_WORKER_INTERVAL_MS` | `60000` | Delay between complete worker iterations. |
| `CRAWL_VERBOSE_LOGGING` | `false` | Include candidate, retry, and discovery diagnostics in crawl logs. |

Additional response-size, parser, HTTP, per-origin, retry, and article-field
limits are documented in [Configuration](configuration.md#feed-crawling-and-scheduling).

### Overlap protection

RSSMonster uses two database-backed layers of protection:

- A per-user active crawl-run constraint prevents a scheduled and API-triggered
  crawl from running for the same user at the same time. A duplicate trigger
  becomes a no-op. Runs older than `CRAWL_RUN_MAX_RUNNING_MINUTES` are marked
  failed so work can recover after a crashed process.
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

## Running the Standalone Worker

For a direct foreground process:

```bash
cd server
npm run start:worker
```

The worker authenticates the database connection, runs an iteration
immediately, waits for the configured interval, and repeats. Iteration errors
are logged without terminating the loop. On `SIGINT` or `SIGTERM`, it stops
scheduling work, lets the current iteration settle, and closes Sequelize.

The web process does not schedule this loop. Keeping the crawler separate
means a long crawl cannot prevent PM2 from supervising and restarting the web
application independently.

## PM2 Production Setup

The root `ecosystem.config.cjs` defines one web process, one worker, and one
inference process:

- `rssmonster-web` runs `server/bootstrap.js`;
- `rssmonster-worker` runs `server/src/workers/crawlWorker.js` as one fork-mode
  instance.
- `rssmonster-inference` runs `inference/src/index.js` as one fork-mode
  instance; see [Inference](inference.md).

From the repository root, start or reload both processes with the production
environment:

```bash
pm2 startOrReload ecosystem.config.cjs --env production --update-env
pm2 save
pm2 status rssmonster-web rssmonster-worker rssmonster-inference
```

Useful operational commands include:

```bash
pm2 logs rssmonster-worker
pm2 restart rssmonster-worker --update-env
pm2 describe rssmonster-worker
```

The worker's PM2 shutdown timeout is intentionally long so an in-progress
crawl can finish before PM2 terminates it. The ecosystem file contains no
secrets; both processes load `server/.env`.

After enabling the worker, disable any OS cron job that calls `/api/crawl` or
runs `npm run crawl`. Leaving both schedulers enabled creates redundant crawl
attempts. If an older installation still has the obsolete `rssmonster-dev` PM2
process, inspect it and remove it once:

```bash
pm2 delete rssmonster-dev
pm2 save
```

Do not add multiple PM2 worker instances. Scale feed throughput with the
documented concurrency settings instead.

## Monitoring and Troubleshooting

The worker logs iteration start, completion, duration, and failures. Each feed
also records its last outcome, diagnostic state, failure count, next fetch
time, and crawl history. Feed observability and crawl statistics are available
from the Settings interface.

When feeds fall behind, check:

1. `pm2 status rssmonster-worker` and the worker logs;
2. database connectivity and pending migrations;
3. whether feeds have a future `nextFetchAt` because of cache policy, backoff,
   or `Retry-After`;
4. timeouts, parser limits, and per-origin throttling;
5. whether concurrency is too high for the database or provider limits; and
6. whether a stale crawl run or expired feed lease is recovering.

Verbose crawl logging can help with discovery and retry diagnosis, but it is
noisier and should normally remain disabled.
