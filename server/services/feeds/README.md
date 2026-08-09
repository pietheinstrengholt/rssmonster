# Feed processing

This directory owns RSSMonster's feed subscription, discovery, HTTP acquisition,
parsing, identity, reconciliation, and refresh-scheduling behavior. It turns an
untrusted HTTP(S) URL into a bounded, canonical feed result and records a
deterministic next action.

The design was informed by and replicates much of the operational work studied
in [CommaFeed](https://github.com/Athou/commafeed), especially conditional HTTP
requests, publisher-aware retry decisions, and empirical activity-based refresh
scheduling. RSSMonster adapts those ideas to its own data model, subscription
flows, security requirements, and concurrency model rather than treating
CommaFeed's exact behavior as a compatibility contract.

## Design goals

Feed processing must remain:

- respectful of publisher cache and rate-limit instructions;
- safe when handling attacker-controlled URLs, redirects, headers, and bodies;
- bounded in response size, parser memory, and total execution time;
- resilient to temporary network and publisher failures;
- efficient when content has not changed;
- deterministic about retry and refresh scheduling;
- safe under concurrent crawl workers; and
- independent of any particular HTTP-client library outside the transport
  adapter.

## End-to-end flow

```text
Subscription or scheduled crawl
        |
        v
Normalize URL and resolve known aliases
        |
        v
Claim feed lease and establish execution deadline
        |
        v
Discover endpoint and acquire HTTP response
        |
        +--> SSRF validation for every request and redirect
        +--> per-origin concurrency and spacing
        +--> conditional request validators
        +--> bounded, single-pass body read
        |
        v
Parse in an isolated worker and normalize to RSSMonster fields
        |
        v
Verify redirects, publisher self URL, and recovery evidence
        |
        v
Reconcile aliases or duplicate feed records transactionally
        |
        v
Persist articles and durable fetch state
        |
        v
Calculate nextFetchAt and release the owned lease
```

The fetch layer reports a closed outcome contract instead of throwing
transport-specific errors through the crawler. Outcomes are `changed`,
`unchanged`, `not_modified`, `rate_limited`, `transient_failure`,
`permanent_failure`, `malformed`, `security_rejected`, `too_large`, and
`timed_out`.

## Main components

| Component | Responsibility |
| --- | --- |
| `feedManagement.js` | Shared subscription creation, update, removal, category ownership, and duplicate checks. |
| `feedAcquisition.js` | Orchestrates discovery, download, parsing, recovery diagnostics, and neutral outcomes. |
| `discoverRssLink.js` | Resolves direct feeds, HTTP redirects, HTML alternates, publisher self links, known service patterns, and conservative fallback candidates. |
| `http/contracts.js` | HTTP-client-independent requests, responses, body streams, errors, redirects, and fetch outcomes. |
| `http/fetchTransport.js` | The native Fetch/Undici adapter. No other feed policy should depend on Fetch API response shapes. |
| `http/acquireHttp.js` | Classifies neutral responses, reads accepted bodies, compares content hashes, and cancels discarded bodies. |
| `http/requestCoordination.js` | Per-origin concurrency/spacing and coalescing of identical in-flight requests. |
| `http/responsePolicy.js` | Parses and bounds cache validators, freshness, and `Retry-After`. |
| `http/responseBody.js` | Performs a deadline-aware, size-limited, single-pass body read and hashing. |
| `feedsmith/` | Isolated parsing and immediate conversion to RSSMonster's canonical feed contract. |
| `feedClaims.js` | Transactional due-feed claims, lease renewal, ownership checks, and owner-only completion. |
| `executionDeadline.js` | Shared cancellation, deadline, and lease-ownership checks across nested operations. |
| `feedFetchState.js` | Durable state transitions for attempts, successes, failures, validators, and content hashes. |
| `feedScheduling.js` | Adaptive refresh intervals, backoff classification, publisher constraints, and stable jitter. |
| `feedUrlAliases.js` | User-scoped historical URL identity and safe URL promotion. |
| `feedSelfIdentity.js` | Validation and persistence of publisher-declared feed identity. |
| `feedReconciliation.js` | Transactional convergence of duplicate feed records, articles, subscriptions, and aliases. |
| `crawlResult.js` | Stable crawl result construction and reporting. |
| `feedLogging.js` | Feed diagnostics with sensitive URL values redacted. |

## HTTP caching and unchanged feeds

Accepted `ETag` and `Last-Modified` validators are stored on the feed and sent as
`If-None-Match` and `If-Modified-Since` on later requests. A `304 Not Modified`
response is successful and does not download or parse a new feed body.

For `200` responses, RSSMonster hashes the raw bounded response bytes. If the
hash matches the last accepted body, the result is `unchanged`, which avoids
unnecessary article processing even when a publisher does not implement
conditional requests correctly.

`Cache-Control`, `Date`, `Age`, and `Expires` are converted into a bounded
`cacheFreshUntil`. `no-cache` and `no-store` prevent future freshness from being
assumed. Publisher freshness is a lower bound on the next request: adaptive
scheduling may choose a later time, but not an earlier one. Persisted freshness
is capped by `FEED_CACHE_FRESHNESS_MAX_MS` (24 hours by default).

Bodies for `304`, rate-limited, transient, and permanent responses are cancelled
without being consumed. This releases network resources and the associated
origin permit promptly.

## Rate limits, retries, and deterministic scheduling

`Retry-After` supports both delta seconds and strict HTTP-date forms. It is
honored for `429` and for `503` when present, and is capped by
`FEED_RETRY_AFTER_MAX_MS` (seven days by default).

The next fetch time is the latest applicable constraint:

```text
max(adaptive or manual interval, cacheFreshUntil, retryAfterAt, failure backoff)
    + deterministic per-feed jitter
```

Stable jitter spreads publisher load by at most one minute without making tests
or repeated calculations random. A user-configured positive interval overrides
the adaptive base interval. An interval of zero disables scheduled refreshes and
stores no `nextFetchAt`.

Retry classification is explicit:

- successful outcomes reset failure state;
- transient failures use exponential backoff starting at five minutes and
  capped at four hours;
- `404` and `410` wait 24 hours;
- other permanent failures and oversized responses wait 12 hours;
- malformed feeds wait 6 hours multiplied by the failure count and are
  quarantined after three consecutive malformed results; and
- security rejections are quarantined immediately and are not automatically
  retried.

The crawler records attempt time separately from successful and changed times,
so failures do not look like successful refreshes. The primary endpoint failure
remains the scheduling cause even when speculative discovery candidates also
fail.

## Adaptive refresh intervals

The default scheduler follows the empirical strategy inspired by CommaFeed:
active feeds are checked frequently, while inactive feeds gradually move toward
a four-hour interval.

- With recent publisher activity and no learned cadence, the base interval is
  five minutes.
- When cadence has been learned, RSSMonster uses half the observed publication
  interval, bounded between five minutes and one hour.
- Seven days without a publication uses one hour.
- Fourteen days without a publication uses two hours.
- Thirty days without a publication, or no known publication time, uses four
  hours.

Cadence is based on the median of adjacent, trustworthy publication intervals.
It ignores future and previously observed timestamps, clamps samples between
five minutes and 30 days, and blends new evidence into the persisted cadence
using an EWMA. This makes the schedule responsive without allowing one malformed
timestamp or one unusual burst to dominate it.

## Request coordination

Requests are coordinated per publisher origin. The default policy allows two
concurrent requests per origin and spaces request starts by at least 250 ms;
`FEED_ORIGIN_MAX_CONCURRENCY` and `FEED_ORIGIN_MIN_SPACING_MS` can change these
limits.

Semantically identical in-flight requests are coalesced by canonical URL,
headers, validators, retry count, and timeout. Callers share network work but
retain independent abort signals and deadlines. One impatient caller therefore
cannot cancel the request for all other callers.

An origin permit covers the complete response-body lifetime. Redirect hops
acquire permits for their actual origins, so redirects cannot bypass publisher
coordination.

## SSRF and URL safety

Only absolute HTTP(S) subscription URLs are accepted. Embedded credentials are
rejected. The outbound safeguard validates the initial endpoint and every
redirect hop, including DNS resolution, so a public hostname cannot redirect or
rebind into loopback, link-local, private, or otherwise prohibited network
space.

Redirect handling remains manual inside the safeguarded transport boundary.
Code must never replace it with automatic client redirects, because doing so
would bypass per-hop SSRF validation and per-origin permits.

Security failures produce `security_rejected`, are logged without leaking
sensitive URL material, and are quarantined instead of retried automatically.

## Bounded response handling

Response bodies are read once through the neutral pull-and-cancel stream
contract. RSSMonster rejects a response before reading when a valid
`Content-Length` exceeds the configured limit, and also counts actual streamed
bytes so missing or dishonest headers cannot evade the limit. Decoded UTF-8
output is checked again to prevent encoding expansion from exceeding the same
budget.

The default maximum response size is 10 MiB and can be configured with
`FEED_RESPONSE_MAX_BYTES`. Reads observe the caller's abort signal and overall
deadline. Oversized, timed-out, and discarded bodies are cancelled.

Decoding recognizes supported HTTP and XML charset declarations and rejects
unsupported or invalid encodings deterministically. The raw accepted bytes are
hashed while streaming, avoiding a second body read.

## Parser isolation and hostile feeds

Parsing runs in a disposable worker thread rather than the crawl process. The
worker is terminated when it finishes, exceeds its CPU deadline, is aborted, or
fails. Defaults are a two-second parser timeout and a 64 MiB old-generation heap,
configurable with `FEED_PARSER_TIMEOUT_MS` and `FEED_PARSER_MEMORY_MB`.

Before and after parsing, XML cleanup and input validation reject unsafe entity
constructs and hostile shapes. Default normalized limits are:

- 1,000 entries per feed;
- 4 KiB per external ID;
- 8 KiB per URL;
- 4 KiB per title;
- 2 KiB per author; and
- 2 MiB combined content and description per entry.

Each limit has a corresponding `FEED_MAX_*` environment setting. Parsed library
objects are immediately normalized into the canonical contract documented in
`feedsmith/README.md`; code outside `feedsmith/` must not depend on parser-library
namespaces or container shapes.

## Execution deadlines and lease safety

Scheduled crawls claim due feeds in short transactions using row locks and
`SKIP LOCKED`. Eligibility requires an active feed whose `nextFetchAt` is due,
whose mute period has expired, and whose previous lease is absent or expired.
Claims use stable `nextFetchAt`, then feed ID, ordering.

Each claimed feed receives an owner token and lease deadline. A heartbeat renews
the lease at one third of its lifetime while work is active. The default lease
is two minutes. All nested discovery and reconciliation operations receive the
same execution context, containing the abort signal, deadline, and lease
ownership assertion.

Writes that can change feed identity run in transactions and revalidate the
lease while holding the relevant row lock. Terminal fetch state and lease
release are committed only by the live owner. If ownership is replaced or
expires, the old worker raises `FEED_LEASE_LOST`; its transaction rolls back and
it cannot overwrite the newer worker's state. When reconciliation selects a
different surviving feed row, the heartbeat and execution context retarget that
survivor explicitly.

## Discovery and redirects

Discovery first tries the submitted endpoint. A valid direct RSS, Atom, or JSON
Feed ends discovery immediately. HTML responses may contribute explicit
`<link rel="alternate">` candidates. Supported service patterns, homepage
checks, common feed paths, and meta refreshes are bounded fallback mechanisms,
not identity proof by themselves.

Initial subscription is intentionally permissive enough to discover a valid
feed from a website URL. Recovery of an established feed is stricter because it
could otherwise silently move an existing subscription to unrelated content.
Recovery considers persisted aliases, validated publisher self identity, body
hashes, reciprocal self declarations, feed format, title, and overlap between
stable recent entry IDs or URLs. Cross-origin recovery requires stronger
evidence than same-origin recovery.

Only a complete and continuous HTTP redirect chain made entirely of `301` and
`308` hops is treated as permanent redirect evidence. `302` and `307`, mixed
chains, self-hops, malformed hops, discontinuities, and chains that do not end at
the reported final URL are not enough to promote an established feed URL without
additional feed-identity evidence.

## Publisher self identity, aliases, and reconciliation

A feed's publisher-declared self URL is a claim, not an instruction. RSSMonster
resolves and fetches it through the same SSRF, request coordination, body, parser,
and deadline policies. The claim is persisted with a validation status and
diagnostic. It is accepted only with sufficient same-feed evidence.

Every user has an independent URL identity namespace. Input URLs, redirect hops,
final endpoints, historical endpoints, and accepted publisher self URLs can be
registered as aliases. Normalization is conservative and the complete normalized
URL is checked in addition to its indexed hash.

If a newly proven endpoint belongs to another feed record for the same user,
reconciliation locks the relevant user and feed records, selects a deterministic
survivor, transfers subscriptions and articles, merges compatible state and
aliases, and removes the duplicate. Lease ownership is asserted throughout the
transaction. This makes repeated discovery, concurrent subscriptions, and URL
changes converge instead of creating parallel feeds.

## Subscription entry points

All subscription paths must converge on `feedManagement.js` rather than
implementing discovery or feed creation independently. Current entry points
include:

- the regular RSSMonster feed validation and creation API;
- Google Reader-compatible quick-add and subscribe operations;
- RSSMonster OPML import;
- Google Reader-compatible OPML import; and
- adding a URL proposed by the separate manual rediscovery assistant.

The shared service normalizes inputs, enforces user/category ownership, resolves
known aliases before repeating discovery, prevents duplicate subscriptions, and
registers verified identity evidence transactionally. OPML input has its own
1 MiB document limit and sends every discovered subscription through the same
guarded flow.

`rediscoverRssUrl.js` itself only produces a suggested replacement URL. It does
not prove or persist feed identity. The update dialog presents the suggestion as
a user-authorized manual replacement. Saving it normalizes the URL, resets state
that belonged to the previous endpoint, and schedules the guarded crawler, but
does not prove same-feed identity before the replacement is stored. The next
crawl still applies SSRF protection, redirect policy, response bounds, and
isolated parsing before accepting publisher content.

## Invariants for future changes

1. Keep policy above the HTTP transport adapter. Do not expose `Response`,
   `Headers`, Undici errors, Axios responses, or another client type outside the
   adapter.
2. Apply SSRF checks and origin permits to every redirect hop, not only the first
   URL.
3. Retain an origin permit until the final response body is consumed or
   cancelled.
4. Read a response body once and enforce limits on actual bytes, not only
   `Content-Length`.
5. Propagate the complete execution context through discovery, parsing, aliases,
   publisher identity, and reconciliation.
6. Assert live lease ownership inside any transaction that performs crawl-time
   writes.
7. Treat publisher self URLs and speculative discovery candidates as evidence
   requiring verification, not authoritative replacements.
8. Preserve the primary endpoint outcome for retry scheduling; candidate
   diagnostics must not accidentally change failure classification.
9. Calculate `nextFetchAt` from all durable constraints and stable jitter rather
   than ad hoc timers.
10. Route every subscription protocol through the shared feed-management
    service.

## Tests

The feed tests under `server/tests/feeds/` cover the HTTP contract, response
policy, request coordination, body decoding and limits, hostile parser inputs,
discovery recovery, publisher self identity, scheduling, reconciliation, and
subscription management. Lease and redirect convergence integration tests live
under `server/tests/crawl/`, with schema behavior covered under
`server/tests/migrations/` and `server/tests/models/`.

When changing this pipeline, run at minimum:

```bash
cd server
npm run lint
npx vitest run tests/feeds tests/crawl/feedLeaseLifecycle.integration.test.js \
  tests/crawl/feedRedirectConvergence.integration.test.js tests/migrations \
  tests/models/feed.model.test.js tests/models/feedUrlAlias.model.test.js
```

Run the complete server suite before merging changes that affect acquisition,
scheduling, persistence, or subscription behavior.
