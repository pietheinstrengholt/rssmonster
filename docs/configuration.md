---
layout: page
title: Configuration
parent: Getting Started
nav_order: 2
---

# Configuration

RSSMonster has sensible defaults for a personal installation, but database,
crawling, security, AI, and recommendation behavior can be configured with
environment variables.

## Where Configuration Lives

The configuration file depends on how RSSMonster is run:

- **Default Docker Compose:** create `.env` in the repository root. Compose
  reads it for variable substitution in `docker-compose.yml`.
- **MySQL Docker Compose:** use the same root `.env` with
  `docker-compose.mysql.yml`.
- **Manual server installation:** copy `server/.env.example` to
  `server/.env`. The web process and crawl worker both load this file.
- **Client:** copy `client/.env.example` to `client/.env`. Variables beginning
  with `VITE_` are compiled into the client bundle, so rebuild the client after
  changing them.

Restart the affected process or recreate its container after changing server
settings. For Docker, only variables listed under a service's `environment`
section are passed into the container. Add crawling options to the
`rssmonster-worker` service and options used by both processes to both service
sections. For example:

```yaml
services:
  rssmonster-worker:
    environment:
      CRAWL_VERBOSE_LOGGING: ${CRAWL_VERBOSE_LOGGING:-false}
```

Do not commit `.env` files. Store secrets as long, random values and restrict
access to them.

## Docker Configuration

The supplied Compose files accept these root `.env` values:

| Variable | Default | Description |
| --- | --- | --- |
| `RSSMONSTER_TAG` | `latest` | RSSMonster image tag to run. |
| `RSSMONSTER_PORT` | `3000` | Host port mapped to container port 3000. |
| `JWT_SECRET` | required | Secret used to sign login tokens. |
| `FEVER_CREDENTIAL_SECRET` | required | Secret used to protect Fever API credentials. Keep it stable after users create credentials. |
| `TRUST_PROXY` | `loopback` | Express trusted-proxy setting; see [Proxy and network security](#proxy-and-network-security). |
| `RSSMONSTER_INTERNAL_HOST_ALLOWLIST` | empty | Explicit exceptions for feeds hosted on private networks. |

The MySQL Compose file additionally accepts:

| Variable | Default | Description |
| --- | --- | --- |
| `DB_DATABASE` | `rssmonster` | MySQL database name. |
| `DB_USERNAME` | `rssmonster` | MySQL application user. |
| `DB_PASSWORD` | required | Password shared by RSSMonster and the MySQL application user. |
| `MYSQL_ROOT_PASSWORD` | required | MySQL root password used by the database container. |

Generate secrets with `openssl rand -hex 32`. Use a different value for each
secret and password.

## Database

### SQLite

```env
DB_DIALECT=sqlite
DB_STORAGE=./data/rssmonster.sqlite
```

`DB_STORAGE` is resolved relative to the `server` directory for a manual
installation. Use an absolute path in production when that makes persistence
clearer. The default Docker deployment sets it to
`/app/data/rssmonster.sqlite` and mounts a persistent volume at `/app/data`.

RSSMonster enables WAL mode, foreign-key enforcement, and a five-second busy
timeout for SQLite. It also forces sequential crawling: parallel feed
processing is disabled, concurrent user crawls are limited to one, and the
user batch size is limited to one. Settings that request more concurrency are
therefore ignored or capped when SQLite is active.

### MySQL

```env
DB_DIALECT=mysql
DB_HOSTNAME=localhost
DB_PORT=3306
DB_DATABASE=rssmonster
DB_USERNAME=rssmonster
DB_PASSWORD=replace-with-a-strong-password
```

Use MySQL for higher write concurrency, multiple active users, or more
demanding workloads. All five connection values are required when
`DB_DIALECT=mysql`; the default port is `3306`.

After changing databases or creating a new database, apply the canonical
migrations from the `server` directory with `npm run db`. Docker images apply
pending migrations automatically at startup.

## Application and Authentication

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime mode: `development`, `production`, or `test`. Use `production` for deployments. |
| `PORT` | `3000` | HTTP port used by the server. The supplied containers set this to 3000. |
| `JWT_SECRET` | none | Required secret for signing and verifying JWTs. |
| `JWT_EXPIRES_IN` | `86400` | Login-token lifetime in seconds. The example file uses `604800` (seven days). |
| `FEVER_CREDENTIAL_SECRET` | none | Required secret for keyed Fever credential hashes. Changing it invalidates existing Fever API credentials. |
| `ENABLE_DEVELOPMENT_LOGIN` | `false` | Enables login without normal credentials, but only when `NODE_ENV=development`. Never enable it in a shared environment. |
| `DEVELOPMENT_LOGIN_USER_ID` | none | Existing positive user ID selected by development login. It must be set when development login is enabled. |
| `ENABLE_HTTPS` | `false` | When `true`, starts the server with certificates from `server/cert`. A reverse proxy is usually easier to operate. |
| `DISABLE_LISTENER` | `false` | Prevents the HTTP listener from starting. This is intended for one-off crawl commands and tests. |

Authentication and API credential flows require these secrets. The supplied
Compose files refuse to start without them. Keep both values stable across
restarts and upgrades.

See [First Login](first-login.md) for the normal registration flow and the
security implications of enabling development login.

## Feed Crawling and Scheduling

Most installations should begin with the example defaults. Increase
concurrency gradually while watching database load, crawl duration, HTTP 429
responses, and timeouts.

| Variable | Default | Unit | Effect |
| --- | ---: | --- | --- |
| `FEED_MAX_COUNT` | `10` | feeds | Maximum feeds claimed by one crawl invocation. |
| `FEED_PARALLEL_CONCURRENCY` | `3` | feeds | Process-wide simultaneous feed workers. SQLite caps this at 1. |
| `FEED_TIMEOUT_MS` | `60000` | ms | Overall processing deadline for one feed. |
| `FEED_LEASE_MS` | `120000` | ms | Duration of a feed claim. The effective value is never less than twice `FEED_TIMEOUT_MS`. |
| `CRAWL_TIMEOUT_MS` | `600000` | ms | Overall deadline for a crawl invocation. |
| `CRAWL_DUPLICATE_CACHE_DAYS` | `30` | days | Article history loaded into the deterministic duplicate cache. Higher values use more memory and database work. |
| `CRAWL_RUN_MAX_RUNNING_MINUTES` | `60` | minutes | Age after which an unfinished crawl run is marked stale. |
| `CRAWL_PARALLELPROCESSFLAG` | `0` | boolean integer | Set to `1` to allow parallel feed processing on MySQL. SQLite always forces `0`. |
| `CRAWL_WORKER_INTERVAL_MS` | `60000` | ms | Delay between dedicated worker polls. Must be a positive integer. |
| `CRAWL_WORKER_HEALTH_MAX_FAILURES` | `3` | failures | Consecutive failed crawl iterations allowed before the worker is unhealthy. |
| `CRAWL_WORKER_HEALTH_MAX_STALE_MS` | `900000` | ms | Maximum age of the worker health state before the worker is unhealthy. |
| `CRAWL_VERBOSE_LOGGING` | `false` | boolean | Emits candidate, retry, and feed-discovery diagnostics in addition to final results. |

`FEED_PARALLEL_CONCURRENCY` is the main MySQL throughput control. Raising it
increases simultaneous network, parser, AI, and database work. Keep
`FEED_LEASE_MS` comfortably above realistic feed-processing time so another
worker does not reclaim active work.

### HTTP Fetch Behavior

| Variable | Default | Unit | Effect |
| --- | ---: | --- | --- |
| `FEED_HTTP_TIMEOUT_MS` | `10000` | ms | Deadline for an individual feed HTTP request. |
| `FEED_RESPONSE_MAX_BYTES` | `10485760` | bytes | Maximum downloaded response body (10 MiB). |
| `FEED_ORIGIN_MAX_CONCURRENCY` | `2` | requests | Simultaneous requests to the same origin. |
| `FEED_ORIGIN_MIN_SPACING_MS` | `250` | ms | Minimum delay between requests to the same origin. Set to `0` to disable spacing. |
| `FEED_CACHE_FRESHNESS_MAX_MS` | `86400000` | ms | Maximum accepted cache-freshness period from publisher headers (one day). |
| `FEED_RETRY_AFTER_MAX_MS` | `604800000` | ms | Maximum accepted `Retry-After` delay (seven days). |

Lower per-origin concurrency and larger spacing are gentler on publishers.
Increasing response or timeout limits can accommodate unusual feeds, but also
increases the resources a slow or oversized response may consume.

### Parser Safety Limits

Feeds are parsed in disposable worker threads with CPU and memory bounds.
Entries that exceed the configured input limits are rejected before article
enrichment and persistence.

| Variable | Default | Unit | Effect |
| --- | ---: | --- | --- |
| `FEED_PARSER_TIMEOUT_MS` | `2000` | ms | Parser worker deadline. |
| `FEED_PARSER_MEMORY_MB` | `64` | MiB | Parser worker old-generation heap limit. |
| `FEED_MAX_ENTRIES` | `1000` | entries | Maximum entries accepted in one feed response. |
| `FEED_MAX_GUID_BYTES` | `4096` | bytes | Maximum normalized entry identifier size. |
| `FEED_MAX_URL_BYTES` | `8192` | bytes | Maximum normalized entry URL size. |
| `FEED_MAX_TITLE_BYTES` | `4096` | bytes | Maximum normalized title size. |
| `FEED_MAX_AUTHOR_BYTES` | `2048` | bytes | Maximum normalized author size. |
| `FEED_MAX_CONTENT_BYTES` | `2097152` | bytes | Maximum combined content and description size per entry (2 MiB). |

These are defensive limits, not routine performance targets. Raise one only
when a trusted feed is known to exceed it and the added resource exposure is
acceptable.

## Proxy and Network Security

### `TRUST_PROXY`

RSSMonster defaults to `loopback`, which is appropriate for a reverse proxy on
the same host. It also accepts a positive proxy hop count or an Express trusted
address/subnet expression. `false` disables proxy trust. The value `true` is
rejected because trusting every proxy can let clients spoof their address and
affect rate limiting.

Examples:

```env
TRUST_PROXY=loopback
# TRUST_PROXY=1
# TRUST_PROXY=false
```

### `RSSMONSTER_INTERNAL_HOST_ALLOWLIST`

Outbound feed requests block loopback, private, link-local, and other
non-public address ranges to reduce server-side request-forgery risk. If you
intentionally subscribe to an internal feed, add only its exact host, IP, CIDR,
or `host:port` to the space-separated allowlist:

```env
RSSMONSTER_INTERNAL_HOST_ALLOWLIST=feeds.internal.example 10.20.30.40:8080
```

Keep exceptions narrow. An allowlisted destination becomes reachable by the
server's feed-fetching code.

## Rate Limiting

| Variable | Default | Description |
| --- | ---: | --- |
| `API_RATE_LIMIT_WINDOW_MS` | `900000` | API rate-limit window in milliseconds (15 minutes). |
| `API_RATE_LIMIT_MAX` | `600` | Requests allowed per client during the API window. |
| `MCP_RATE_LIMIT_WINDOW_MS` | `900000` | MCP rate-limit window in milliseconds. |
| `MCP_RATE_LIMIT_MAX` | `100` | Requests allowed per client during the MCP window. |

All values must be positive integers. Health checks and `OPTIONS` requests are
excluded. Configure `TRUST_PROXY` correctly before tuning limits behind a
reverse proxy so client addresses are interpreted correctly.

## Inference and OpenAI Features

| Variable | Default | Description |
| --- | --- | --- |
| `INFERENCE_URL` | `http://127.0.0.1:3001` | Standalone inference service used for all model requests. |
| `INFERENCE_TIMEOUT_MS` | `30000` | Timeout for embeddings, classification, recommendations, and feed rediscovery. |
| `INFERENCE_AGENT_TIMEOUT_MS` | `300000` | Timeout for streamed assistant model requests. |
| `INFERENCE_AI_ENABLED` | `false` | Master switch for server and client inference capabilities. Only explicit `true` allows inference requests. |
| `INFERENCE_ASSISTANT_ENABLED` | `false` | Enables assistant routes and UI only when explicitly `true`. Enable it after configuring the provider and credentials in inference. |
| `SKIP_ARTICLE_CLASSIFICATION_ANALYSIS` | `false` | When `true`, uses default article scores and feed-category tags without calling inference classification. |
| `SKIP_ARTICLE_EMBEDDINGS` | `false` | When `true`, disables article vector generation and defaults new feeds to embeddings disabled. |
| `INTERNAL_MCP_URL` | `http://127.0.0.1:$PORT/mcp` | Server-controlled MCP endpoint used by the natural-language assistant. Configure this when MCP is reached through another container or an HTTPS listener. |

When `INFERENCE_AI_ENABLED` is not explicitly `true`, it overrides the
feature-specific settings: classification and embeddings remain local or disabled,
and assistant, Smart Folder recommendation, and feed-rediscovery requests return
`INFERENCE_DISABLED` without contacting an inference endpoint.

OpenAI credentials and model names belong only in `inference/.env`; see
[Model Usage](model-usage.md). The server executes authenticated assistant
tools locally, while inference performs every provider model call. The server
uses only `INFERENCE_ASSISTANT_ENABLED` and never receives the OpenAI key.

## Recommendations

| Variable | Default | Description |
| --- | ---: | --- |
| `ARTICLE_RECOMMENDATION_MIN_SIMILARITY` | `0.64` | Minimum cosine similarity for recent article recommendations. Valid range is -1 through 1. Higher values return fewer, closer matches. |
| `ARTICLE_RECOMMENDATION_MAX_CANDIDATES` | `600` | Number of recent vectorized articles considered. Values are capped at 600. Lower values reduce query and scoring work. |

Zero recommendations is valid. Tune the similarity threshold cautiously and
evaluate results across several users and feed mixes.

## Client Build Configuration

| Variable | Example | Description |
| --- | --- | --- |
| `VITE_APP_HOSTNAME` | `http://localhost:3000` | Base URL used by the browser for API requests. Use the public server origin. |
| `VITE_BASE_URL` | `/` | Reserved in the example configuration; the current client does not read this custom variable. |

Vite embeds these values during `npm run build`. Restarting an already-built
client without rebuilding does not apply changes.
Development-only client behavior is derived automatically from Vite's active mode.

## Example Manual Configurations

Minimal SQLite `server/.env`:

```env
NODE_ENV=production
DB_DIALECT=sqlite
DB_STORAGE=/var/lib/rssmonster/rssmonster.sqlite
JWT_SECRET=replace-with-a-long-random-secret
FEVER_CREDENTIAL_SECRET=replace-with-a-different-long-random-secret
TRUST_PROXY=loopback
```

MySQL with modest parallel crawling:

```env
NODE_ENV=production
DB_DIALECT=mysql
DB_HOSTNAME=127.0.0.1
DB_PORT=3306
DB_DATABASE=rssmonster
DB_USERNAME=rssmonster
DB_PASSWORD=replace-with-a-strong-password
JWT_SECRET=replace-with-a-long-random-secret
FEVER_CREDENTIAL_SECRET=replace-with-a-different-long-random-secret
CRAWL_PARALLELPROCESSFLAG=1
FEED_PARALLEL_CONCURRENCY=3
CRAWL_WORKER_INTERVAL_MS=60000
TRUST_PROXY=loopback
```

Start with defaults, change one group of settings at a time, and inspect crawl
statistics and logs before increasing concurrency or resource limits.
