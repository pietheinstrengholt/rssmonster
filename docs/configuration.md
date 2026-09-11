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
  `server/.env`. The web, crawl worker, and AI worker load this file.
- **Client:** copy `client/.env.example` to `client/.env`. Variables beginning
  with `VITE_` are compiled into the client bundle, so rebuild the client after
  changing them.

Restart the affected process or recreate its container after changing server
settings. For Docker, only variables listed under a service's `environment`
section are passed into the container. Add crawling options to
`rssmonster-worker`, processing-job options to `rssmonster-ai-worker`, and
shared database or inference options to both services. For example:

```yaml
services:
  rssmonster-worker:
    environment:
      CRAWL_VERBOSE_LOGGING: ${CRAWL_VERBOSE_LOGGING:-false}
```

Do not commit `.env` files. Store secrets as long, random values. On systems
with POSIX file permissions, restrict each secret-bearing environment file to
its owner after creating it:

```bash
chmod 600 .env
# For a manual server installation:
chmod 600 server/.env
```

The root `.env` remains on the Docker host: Compose reads it for variable
substitution and passes the configured values into the containers. It is
excluded from Docker build contexts and is not mounted into the containers, so
neither the Dockerfile nor Compose can set its host permissions. On platforms
without POSIX permissions, use the platform's access controls to grant access
only to the account that runs RSSMonster.

## Docker Configuration

The supplied Compose files accept these root `.env` values:

| Variable | Default | Description |
| --- | --- | --- |
| `RSSMONSTER_IMAGE` | unset | Complete RSSMonster image reference. When set, it overrides `RSSMONSTER_TAG` and can include a digest. |
| `RSSMONSTER_TAG` | `latest` | RSSMonster image tag used when `RSSMONSTER_IMAGE` is unset. Use `latest` only for quick starts or deliberate rolling updates. |
| `RSSMONSTER_BIND_ADDRESS` | `127.0.0.1` | Host address on which Docker publishes the application port. |
| `RSSMONSTER_PORT` | `3000` | Host port mapped to container port 3000. |
| `JWT_SECRET` | required | Secret used to sign login tokens. |
| `FEVER_CREDENTIAL_SECRET` | required | Secret used to protect Fever API credentials. Keep it stable after users create credentials. |
| `TRUST_PROXY` | `false` | Express trusted-proxy setting; see [Proxy and network security](#proxy-and-network-security). |
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

### Pinning the Docker image

The quick start defaults to `latest` for convenience. Do not use this moving tag
for unattended production deployments: a later `docker compose pull` can change
the running application and apply database migrations without selecting a
specific release first.

The image publishing workflow creates a `sha-` tag for each published source
revision. Pin that tag in the root `.env`:

```env
RSSMONSTER_TAG=sha-abcdef0
```

For cryptographic pinning, use the published manifest digest as the complete
image reference instead:

```env
RSSMONSTER_IMAGE=rssmonster/rssmonster@sha256:replace-with-published-digest
```

`RSSMONSTER_IMAGE` takes precedence over `RSSMONSTER_TAG` and applies to the web,
crawl-worker, and AI-worker containers so they always run the same image. Change
the pin deliberately when updating, review the release or source changes, back
up the database, and then run `docker compose pull` followed by
`docker compose up -d` with the applicable Compose file.

See [Backup and Restore]({% link backup-restore.md %}) for consistent SQLite and MySQL
procedures and guidance on preserving the root `.env` separately.

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

SQLite is intended for lightweight local experimentation, not
database-intensive processing such as background AI jobs. Optional-processing
concurrency is therefore always limited to one on SQLite, and the default
SQLite Compose profile intentionally does not start `rssmonster-ai-worker`.
Use the MySQL Compose profile when background article analysis or semantic
labeling is required. This is a deliberate product and deployment boundary,
not a missing Compose service.

### MySQL

```env
DB_DIALECT=mysql
DB_HOSTNAME=localhost
DB_PORT=3306
DB_DATABASE=rssmonster
DB_USERNAME=rssmonster
DB_PASSWORD=replace-with-a-strong-password
```

Use MySQL for higher write concurrency, multiple active users, background AI
processing, or other demanding workloads. All five connection values are
required when `DB_DIALECT=mysql`; the default port is `3306`.

After changing databases or creating a new database, apply the canonical
migrations from the `server` directory with `npm run db`. Docker images apply
pending migrations automatically at startup.

### MySQL sort memory

For large article collections with observed sort-memory bottlenecks, consider
this MySQL server setting in `my.cnf`:

```ini
[mysqld]
sort_buffer_size = 4M
```

This is an optional tuning example, not a prerequisite or a supplied Compose
setting. Evaluate query behavior and memory use before changing it.

## Application and Authentication

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime mode: `development`, `production`, or `test`. Use `production` for deployments. |
| `PORT` | `3000` | HTTP port used by the server. The supplied containers set this to 3000. |
| `JWT_SECRET` | none | Required secret for signing and verifying JWTs. |
| `JWT_EXPIRES_IN` | `86400` | Login-token lifetime in seconds. The example file uses `604800` (seven days). |
| `ALLOW_REGISTRATION` | `true` | Set to `false` to disable public account creation. Hides signup and rejects registration API requests with HTTP 403, including when no users exist. Existing accounts, login, and password recovery are unaffected. |
| `FEVER_CREDENTIAL_SECRET` | none | Required secret for keyed Fever credential hashes. Changing it invalidates existing Fever API credentials. |
| `ENABLE_DEVELOPMENT_LOGIN` | `false` | Enables login without normal credentials, but only when `NODE_ENV=development`. Never enable it in a shared environment. |
| `DEVELOPMENT_LOGIN_USER_ID` | none | Existing positive user ID selected by development login. It must be set when development login is enabled. |
| `ENABLE_HTTPS` | `false` | When `true`, starts the server with certificates from `server/cert`. A reverse proxy is usually easier to operate. |
| `DISABLE_LISTENER` | `false` | Prevents the HTTP listener from starting. This is intended for one-off crawl commands and tests. |

Authentication and API credential flows require these secrets. The supplied
Compose files refuse to start without them. Keep both values stable across
restarts and upgrades.

For a manual installation, add `ALLOW_REGISTRATION=false` to `server/.env` and
restart the server. For Docker Compose, add `ALLOW_REGISTRATION: "false"` under
the `rssmonster` service's `environment` and recreate the container. Adding it
only to the root `.env` does not pass it into the container automatically.
Leave it unset or set it to `true` to allow registration again.

See [First Login]({% link first-login.md %}) for administrator setup before
disabling registration, the normal registration flow, and the security
implications of enabling development login.

### Authentication Policies and OIDC

For a provider-neutral setup guide, a Google example, and a preview of provider-only login, see
[OIDC Configuration]({% link oidc-configuration.md %}).

Authentication configuration separates local account registration, local sign-in,
and OIDC sign-in. OIDC account provisioning is an additional independent policy:

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALLOW_REGISTRATION` | `true` | Allows visitors to create local accounts. Disabling it does not disable login. |
| `LOCAL_AUTH_ENABLED` | `true` | Enables local password login, registration, password recovery/changes, development login, and password-derived Fever/Google Reader access. |
| `OIDC_ENABLED` | `false` | Enables provider sign-in for linked identities and, when allowed, automatic provisioning. |
| `OIDC_AUTO_PROVISION` | `false` | Allows a valid, previously unknown provider identity to create an ordinary OIDC-only account. Independent of public local registration. |

Values accept `true` or `false`, ignoring case and surrounding whitespace. Unset
or blank values use the defaults. Other values stop server startup with a
configuration error; this also applies to `ALLOW_REGISTRATION`.

OIDC uses a server-owned Authorization Code flow with PKCE, state, nonce, and
ID-token signature validation. The browser receives a normal RSSMonster session
after a short-lived, single-use handoff; provider tokens stay on the server.
Sign in locally and link your identity provider from **Settings → Account**
by confirming your current password. You can then sign out and use **Sign in
with identity provider**. With automatic provisioning disabled, unknown identities
are rejected, even if their email matches an existing account. Your local user ID,
role, feeds and reading state remain unchanged. Existing email-verification
requirements still apply.

Set `OIDC_AUTO_PROVISION=true` to create accounts after a valid provider login,
including when `ALLOW_REGISTRATION=false`. Each identity is keyed by its exact,
case-sensitive issuer and subject; a unique SHA-256 key enforces this independently
of the database's text collation. Account and identity creation are transactional,
and concurrent first logins converge on the same account. Emails never link
accounts automatically. A verified provider email is normalized and saved when
creating an account; an unverified email is ignored. An email already used by an
existing account causes provisioning to fail, so link that existing account
explicitly instead. Later logins synchronize verified provider email for OIDC-only accounts. Linked
local accounts retain their locally managed email settings.

Provisioned accounts receive a stable generated username, the ordinary `user`
role, and no local password or Fever credential. Password recovery, account
settings and administrator password updates cannot create local credentials for
these accounts. Manage the provider password at the provider; legacy Google
Reader and Fever password authentication are unavailable for OIDC-only accounts.
Linking an existing local account preserves its credentials and API access.

By default, no additional claim restrictions apply to OIDC sign-in. Optional
allowlists restrict every provider login, including existing linked accounts,
new provisioning, and account linking:

| Variable | Default | Meaning |
| --- | --- | --- |
| `OIDC_ALLOWED_EMAIL_DOMAINS` | empty | Comma-separated exact email domains, e.g. `example.com,example.org`. Requires a valid ID-token email and boolean `email_verified=true`. Domain matching ignores case; subdomains and suffix matches are not included. Use ASCII/punycode domains, without wildcards or `@`. |
| `OIDC_ALLOWED_GROUPS` | empty | Comma-separated group names. At least one must match exactly, including case, in an ID-token array of strings. |
| `OIDC_GROUPS_CLAIM` | `groups` | Literal top-level ID-token claim containing that array. Dots or slashes in the name are literal, not a nested path. |

Blank allowlists disable that restriction. When both are configured, both must
pass. Missing, unverified, or malformed required claims deny access before
account lookup or creation. Configure your provider to include the necessary
claims in its ID token; RSSMonster does not fetch groups from another endpoint.
Restrictions never map provider groups or claims to administrator roles.
Malformed nonempty lists stop startup when OIDC is enabled.

For an email-domain restriction during your Google test, set
`OIDC_ALLOWED_EMAIL_DOMAINS=example.com` to your intended email domain. This
checks verified email addresses, not organization membership. Allowing
`gmail.com` permits any verified address in that domain subject to the other
login/provisioning policies; it is not a list of individual test users. Keep
provider-side application access restrictions in place as needed.

Policy changes invalidate pending OIDC callbacks and handoffs. Existing web
sessions retain their normal expiry; claim restrictions apply at the next OIDC
login and do not restrict local login when it remains enabled.

Set `LOCAL_AUTH_ENABLED=false` only after configuring and testing OIDC and
linking your administrator account. Local registration is then unavailable even
if `ALLOW_REGISTRATION=true`. Password reset requests and confirmations,
account/admin password changes, development login, and password-confirmed
provider linking are blocked. Existing Fever keys/cookies and Google Reader
tokens are rejected. Passwords remain stored, so re-enabling local authentication
restores their use. Existing web sessions retain their normal expiry and password
version checks; this setting does not revoke them. Email verification and
non-password account settings remain available.

Create the initial administrator locally before closing public registration. OIDC never promotes the first provider user. An
existing administrator may explicitly promote an account through Manage Users.

The following provider settings stay on the server and are not exposed by the
public authentication configuration endpoint:

| Variable | Default | Validation when `OIDC_ENABLED=true` |
| --- | --- | --- |
| `OIDC_ISSUER_URL` | none | Required HTTPS issuer URL; use the issuer, not its discovery-document URL. |
| `OIDC_CLIENT_ID` | none | Required nonempty client identifier. |
| `OIDC_CLIENT_SECRET` | none | Required nonempty secret, retained only on the server. |
| `OIDC_REDIRECT_URI` | none | Required HTTPS callback URL with path `/api/auth/oidc/callback`. HTTP is accepted only for `localhost`, `127.0.0.1`, or `[::1]` to support local testing. |
| `OIDC_FRONTEND_URL` | callback origin | Optional frontend root URL for the final handoff. Must share the callback scheme and hostname; a different port is allowed. |
| `OIDC_SCOPES` | `openid profile email` | Space-separated scopes; must include `openid`. |

Issuer and callback URLs cannot contain credentials, query parameters, or
fragments. Provider settings are ignored while OIDC is disabled, so existing
installations need no new configuration. By default, the callback origin is
the fixed frontend return destination. Set `OIDC_FRONTEND_URL` when the frontend
runs on a different port, such as `http://localhost:8080` with the API on port
3000. This configured frontend origin is also the only accepted origin for
credentialed OIDC linking and handoff requests. Scheme and hostname must match
the callback so the browser-bound SameSite cookie works across ports. Arbitrary
return URLs, different hostnames, and frontend subpaths are not supported.

Apply `20260910000000-add-oidc-login.js` and
`20260910001000-allow-oidc-only-users.js` through the normal upgrade procedure
before enabling OIDC. They add identity and temporary login tables and make local
credentials nullable while preserving existing credential values. Rolling back
the nullable-credential migration is refused while passwordless accounts exist.
All server instances must share the database, JWT secret and OIDC configuration.

#### Test with Google

1. Create an OAuth client of type **Web application** in Google Cloud, configure
   its consent screen/audience, and add your Google account as a test user if
   the application is in testing mode.
2. Register the exact authorized redirect URI, for example
   `http://localhost:3000/api/auth/oidc/callback` for a local installation.
3. Configure the server (or the Compose service's `environment`):

   ```env
   OIDC_ENABLED=true
   OIDC_ISSUER_URL=https://accounts.google.com
   OIDC_CLIENT_ID=your-google-client-id
   OIDC_CLIENT_SECRET=your-google-client-secret
   OIDC_REDIRECT_URI=http://localhost:3000/api/auth/oidc/callback
   OIDC_SCOPES=openid profile email
   OIDC_AUTO_PROVISION=false
   LOCAL_AUTH_ENABLED=true
   ```

4. Restart the server or recreate the container, open `http://localhost:3000`,
   sign in to an existing RSSMonster account, and link Google in **Settings →
   Account**. Confirm your current RSSMonster password and choose your Google
   account. Then sign out of RSSMonster and test provider sign-in.
5. Verify that an unlinked Google account is rejected and that successful login
   returns to the same RSSMonster account and data. You may keep
   `ALLOW_REGISTRATION=false` throughout linking and provider sign-in.

For remote deployments, use the public HTTPS address in both Google and
`OIDC_REDIRECT_URI`. See [Google's OIDC documentation](https://developers.google.com/identity/openid-connect/openid-connect)
for client setup and redirect requirements.

Starting another login in the same browser replaces its pending browser cookie;
finish the newest attempt. Abandoned attempts expire after ten minutes, and the
handoff code expires after one minute. A provider outage leaves local login
available only when `LOCAL_AUTH_ENABLED=true`. RSSMonster logout does not sign out of Google, and suspending a
provider account does not immediately revoke existing RSSMonster JWTs; their
normal expiry and password-change invalidation still apply.

## Feed Crawling and Scheduling

Most installations should begin with the example defaults. Increase
concurrency gradually while watching database load, crawl duration, HTTP 429
responses, and timeouts.

| Variable | Default | Unit | Effect |
| --- | ---: | --- | --- |
| `FEED_MAX_COUNT` | `100` | feeds | Maximum feeds claimed by one crawl invocation. |
| `FEED_PARALLEL_CONCURRENCY` | `3` | feeds | Process-wide simultaneous feed workers. SQLite caps this at 1. |
| `FEED_TIMEOUT_MS` | `60000` | ms | Overall processing deadline for one feed. |
| `FEED_LEASE_MS` | `120000` | ms | Duration of a feed claim. The effective value is never less than twice `FEED_TIMEOUT_MS`. |
| `CRAWL_TIMEOUT_MS` | `600000` | ms | Overall deadline for a crawl invocation. |
| `CRAWL_DUPLICATE_CACHE_DAYS` | `30` | days | Article history loaded into the deterministic duplicate cache. Higher values use more memory and database work. |
| `CRAWL_RUN_HEARTBEAT_INTERVAL_MS` | `30000` | ms | Renewal interval for an active crawl run's ownership heartbeat. |
| `CRAWL_RUN_STALE_AFTER_MS` | `120000` | ms | Age after which a missing crawl-run heartbeat is treated as stale. The effective value is at least three heartbeat intervals. |
| `CRAWL_USER_BATCH_SIZE` | `5` | users | Users crawled concurrently on MySQL. SQLite always uses `1`. |
| `CRAWL_PARALLELPROCESSFLAG` | `0` | boolean integer | Set to `1` to allow parallel feed processing on MySQL. SQLite always forces `0`. |
| `CRAWL_WORKER_INTERVAL_MS` | `60000` | ms | Delay between dedicated worker polls. Must be a positive integer. |
| `PROCESSING_JOB_POLL_INTERVAL_MS` | `1000` | ms | Delay when no optional processing work is available. |
| `PROCESSING_JOB_CONCURRENCY` | `1` | jobs | Maximum optional jobs executed concurrently. A manually started AI worker on SQLite always forces this to `1`. |
| `PROCESSING_JOB_SHUTDOWN_TIMEOUT_MS` | `30000` | ms | Grace period for in-flight optional jobs before their abort signal is triggered. |
| `PROCESSING_JOB_REPORT_INTERVAL_MS` | `60000` | ms | Interval for durable queue depth, retry, terminal outcome, and latency snapshots in AI-worker health state. |
| `CRAWL_PRIORITY_LEASE_MS` | `90000` | ms | Duration of the renewable database gate that gives the crawl semantic pipeline priority over new optional claims. |
| `CRAWL_PRIORITY_HEARTBEAT_MS` | `30000` | ms | Renewal interval for the crawl-priority lease. |
| `CRAWL_WORKER_HEALTH_MAX_FAILURES` | `3` | failures | Consecutive failed crawl iterations allowed before the worker is unhealthy. |
| `CRAWL_WORKER_HEALTH_MAX_STALE_MS` | `900000` | ms | Maximum age of the worker health state before the worker is unhealthy. |
| `CRAWL_WORKER_HEALTH_FILE` | `/tmp/rssmonster-crawl-worker-health.json` | path | Crawl-worker heartbeat file. Compose overrides this with its shared health volume. |
| `AI_WORKER_HEALTH_MAX_FAILURES` | `3` | failures | Consecutive failed AI-worker iterations allowed before its health check fails. |
| `AI_WORKER_HEALTH_MAX_STALE_MS` | `900000` | ms | Maximum age of the AI-worker health state before it is considered stale. |
| `AI_WORKER_HEALTH_FILE` | `/tmp/rssmonster-ai-worker-health.json` | path | AI-worker heartbeat file read by the status API and health check. Compose overrides this with its shared health volume. |
| `CRAWL_VERBOSE_LOGGING` | `false` | boolean | Emits candidate, retry, and feed-discovery diagnostics in addition to final results. |

`FEED_PARALLEL_CONCURRENCY` is the main MySQL throughput control. Raising it
increases simultaneous network, parser, AI, and database work. Keep
`FEED_LEASE_MS` comfortably above realistic feed-processing time so another
worker does not reclaim active work.

PM2 and the MySQL Compose profile run scheduled crawling in `rssmonster-worker`
and optional jobs in `rssmonster-ai-worker`. A renewable database lease pauses
new optional claims while the crawl, embedding, event, topic, and island-scoring
pipeline is active; crawling never waits for the optional queue to drain.
The lightweight SQLite Compose profile runs only `rssmonster-worker` and has
no optional-job consumer by default. Remote inference connectivity is configured independently.

### HTTP Fetch Behavior

| Variable | Default | Unit | Effect |
| --- | ---: | --- | --- |
| `FEED_CONNECT_TIMEOUT_MS` | `10000` | ms | Maximum time allowed to establish a feed TCP/TLS connection. |
| `FEED_BODY_TIMEOUT_MS` | `30000` | ms | Maximum time allowed to download a feed body after response headers arrive. |
| `FEED_RESPONSE_MAX_BYTES` | `10485760` | bytes | Maximum downloaded response body (10 MiB). |
| `FEED_ORIGIN_MAX_CONCURRENCY` | `2` | requests | Simultaneous requests to the same origin. |
| `FEED_ORIGIN_MIN_SPACING_MS` | `250` | ms | Minimum delay between requests to the same origin. Set to `0` to disable spacing. |
| `FEED_CACHE_FRESHNESS_MAX_MS` | `86400000` | ms | Maximum accepted cache-freshness period from publisher headers (one day). |
| `FEED_RETRY_AFTER_MAX_MS` | `604800000` | ms | Maximum accepted `Retry-After` delay (seven days). |

Lower per-origin concurrency and larger spacing are gentler on publishers.
The connection and body limits apply to their individual HTTP phases, while
`FEED_TIMEOUT_MS` remains the hard deadline for all acquisition, parsing, and
persistence work for one feed. Increasing response or timeout limits can
accommodate unusual feeds, but also increases the resources a slow or oversized
response may consume. Replace the former `FEED_HTTP_TIMEOUT_MS` setting with
the two phase-specific settings when upgrading an existing manual installation.

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

RSSMonster defaults to `false`, so forwarded client-address headers are ignored
unless a trusted proxy is configured. It accepts `loopback`, a positive proxy
hop count, or an Express trusted address/subnet expression. The value `true` is
rejected because trusting every proxy can let clients spoof their address and
affect rate limiting.

The supplied Docker profiles publish the application on host loopback by
default. This keeps clients from bypassing a reverse proxy and sending forged
forwarding headers directly to RSSMonster:

```env
RSSMONSTER_BIND_ADDRESS=127.0.0.1
```

When a reverse proxy runs directly on the Docker host, Docker port forwarding
usually makes the proxy connection appear to RSSMonster as a Docker bridge
address, not as loopback. With the port restricted to host loopback and exactly
one proxy hop, use:

```env
RSSMONSTER_BIND_ADDRESS=127.0.0.1
TRUST_PROXY=1
```

When the reverse proxy runs in a container, attach it to the same Docker network
and send traffic to `rssmonster:3000`. Keep the published host port on loopback,
or remove the `ports` entry in a Compose override, and trust the exact proxy
address/subnet when it is stable. `TRUST_PROXY=1` is also appropriate when that
container is the only possible route to RSSMonster and there is exactly one
proxy hop.

For a manual, non-Docker installation where a same-host proxy connects directly
to `127.0.0.1`, `TRUST_PROXY=loopback` is appropriate. Prefer explicit trusted
addresses or subnets when traffic can arrive through paths with different hop
counts. Do not expose the application directly to untrusted clients while using
a hop-count setting.

To intentionally expose Docker directly on every host interface, disable proxy
trust and opt into the broader bind address:

```env
RSSMONSTER_BIND_ADDRESS=0.0.0.0
TRUST_PROXY=false
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

### Direct HTTPS and Certbot

For a manual installation that terminates TLS in Node, obtain a certificate
with Certbot on the host:

```bash
certbot certonly --standalone -d yourdomain.com --agree-tos -q
```

The standalone challenge needs its validation port available. Place
`fullchain.pem` and `privkey.pem` in `server/cert/`, readable by the server
account, and protect the private key. Set this in `server/.env`:

```env
ENABLE_HTTPS=true
```

Run the application from `server`: certificate paths are relative to its working
directory. `PORT` still controls the listener (default `3000`); enabling HTTPS
does not automatically change it to `443`. Rebuild the client with the actual
public HTTPS origin in `VITE_APP_HOSTNAME` and restart the server.

For a host with Certbot installed, a weekly renewal schedule can be
used as a starting point in the operator's crontab:

```cron
0 0 * * 0 certbot renew --quiet
```

Configure a renewal deploy hook to copy the renewed `fullchain.pem` and
`privkey.pem` from `/etc/letsencrypt/live/yourdomain.com/` into
`/path/to/rssmonster/server/cert/`, preserve restrictive key permissions, and
restart the web service through its service manager. Node reads certificates at
startup, so copying renewed files alone does not activate them. Adapt the hook
to the service account and process manager; do not copy the entire certificate
directory indiscriminately. Reverse-proxy TLS deployments should use the
proxy's certificate renewal and reload mechanism instead.

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
| `INFERENCE_BASE_URL` | unset | Deployment-managed inference endpoint. Takes precedence over Settings; without either, inference is not configured. |
| `INFERENCE_API_KEY` | unset | Optional opaque shared secret; set the exact same value on server/workers and inference. No inference key disables authentication. |
| `INFERENCE_TIMEOUT_MS` | `30000` | Timeout for embeddings, classification, recommendations, and feed rediscovery. |
| `INFERENCE_AGENT_TIMEOUT_MS` | `300000` | Timeout for streamed assistant model requests. |
| `INFERENCE_CIRCUIT_FAILURE_THRESHOLD` | `5` | Consecutive qualifying failures before a capability-specific server inference circuit opens. Must be a positive integer. |
| `INFERENCE_CIRCUIT_COOLDOWN_MS` | `30000` | Minimum open-circuit cooldown before one half-open probe is allowed. Must be a positive integer. |
| `INFERENCE_AI_ENABLED` | unset | Optional permission override. Explicit `false` prohibits inference; otherwise a configured endpoint is required. |
| `INFERENCE_ASSISTANT_ENABLED` | unset | Optional permission override. Explicit `false` disables assistant use; otherwise readiness and advertised capability determine availability. |
| `SKIP_ARTICLE_CLASSIFICATION_ANALYSIS` | `false` | When `true`, uses default article scores and feed-category tags without calling inference classification. |
| `SKIP_ARTICLE_EMBEDDINGS` | `false` | When `true`, disables article vector generation and defaults new feeds to embeddings disabled. |
| `SKIP_SEMANTIC_LABELING` | `false` | When `true`, skips generated event, topic, and island display labels while preserving deterministic names and labels. |

When `INFERENCE_AI_ENABLED` is explicitly `false`, it overrides the
feature-specific settings: classification and embeddings remain local or disabled,
semantic labeling remains disabled, and assistant, Smart Folder recommendation, and feed-rediscovery requests return
`INFERENCE_DISABLED` without contacting an inference endpoint.

OpenAI credentials and model names belong only in `inference/.env`; see
[Model Usage]({% link model-usage.md %}). The server executes authenticated assistant
tools locally, while inference performs every provider model call. The server
uses the shared inference connection and advertised capabilities, respecting optional
permission overrides, and never receives provider API keys.

The server process keeps independent circuit breakers for embeddings,
classification, non-streaming assistant, Smart Folder, and feed-rediscovery
requests. Connection failures, timeouts, HTTP `502`/`503`/`504`, and startup
`not_ready` responses count toward the affected capability's threshold. Queue
overload is intentional endpoint-level load shedding and does not trip a
circuit. While a circuit is open, only that capability fails locally without
contacting inference. After the cooldown—or a longer inference `Retry-After`—one
half-open probe is allowed. Validation, authentication, ordinary `4xx`, and
caller cancellation do not trip the circuit. Requests are never automatically
retried. During crawl ingestion, classification queue overload is recorded as a
warning and falls back to the existing default article analysis so it does not
prevent article or revision persistence.

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
TRUST_PROXY=false
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
TRUST_PROXY=false
```

Start with defaults, change one group of settings at a time, and inspect crawl
statistics and logs before increasing concurrency or resource limits.

## Email and Web Push

Email and browser notifications are independent optional features:

- [Email Configuration]({% link email-configuration.md %}) documents `EMAIL_ENABLED`,
  `PUBLIC_APP_URL`, SMTP authentication/TLS, password-reset rate limits, and
  delivery diagnostics. Enabling email also changes account enrollment requirements.
- [Web App and Notifications]({% link web-app-and-notifications.md %}) documents
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` for browser Push.

Neither feature is enabled merely by installing the web app. Pass the appropriate
variables to each responsible process and recreate containers after changes.

See [inference authentication]({% link inference.md %}#optional-shared-secret-authentication) for key generation, HTTPS, protected endpoints, and the legacy `INFERENCE_URL` fallback.

Inference connections can also be saved by an administrator in Settings → AI / Inference
on MySQL, SQLite, or Desktop. A nonempty environment URL always takes precedence and
hides editing controls; capability status remains visible. See the inference guide
for encrypted key storage, keep/replace/remove semantics, and worker limitations.
