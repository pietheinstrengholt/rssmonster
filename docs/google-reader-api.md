# Google Reader API compatibility

RSSMonster exposes its Google Reader-compatible API at `/api/greader`. The
implementation targets the clients listed below and intentionally does not
attempt to reproduce every historical Google endpoint.

## Authentication setup

Clients use their RSSMonster username and password with `ClientLogin`. The
response contains a credential for the Reader authorization header:

```text
Authorization: GoogleLogin auth=<username>/<authentication-token>
```

State-changing requests must also send the 57-character action token returned
by `GET /reader/api/0/token` in the `T` form or query parameter. Authentication
tokens and action tokens are separate credentials. Reader responses containing
credentials or mutable state use `Cache-Control: no-store, private`.

Examples below use placeholders and contain no real credentials:

```bash
curl --request POST \
  --data-urlencode 'Email=<username>' \
  --data-urlencode 'Passwd=<password>' \
  'https://rss.example.test/api/greader/accounts/ClientLogin'

curl --header \
  'Authorization: GoogleLogin auth=<username>/<authentication-token>' \
  'https://rss.example.test/api/greader/reader/api/0/subscription/list?output=json'

curl --header \
  'Authorization: GoogleLogin auth=<username>/<authentication-token>' \
  'https://rss.example.test/api/greader/reader/api/0/token'

curl --request POST \
  --header \
  'Authorization: GoogleLogin auth=<username>/<authentication-token>' \
  --form 'T=<action-token>' \
  --form 'subscriptions_file=@subscriptions.opml;type=text/xml' \
  'https://rss.example.test/api/greader/reader/api/0/subscription/import'
```

To verify that a reverse proxy forwards the Authorization header:

```bash
curl --header \
  'Authorization: GoogleLogin auth=<username>/<64-character-token>' \
  'https://rss.example.test/api/greader/check/compatibility'
```

The check returns `PASS Authorization header forwarded` for the supported
header shape. Missing or unsupported headers return a `FAIL ...` response. It
checks proxy/header transport, not account credentials.

## Supported endpoint matrix

| Endpoint | Methods | Support |
| --- | --- | --- |
| `/accounts/ClientLogin` | GET, POST | Supported |
| `/check/compatibility` | GET | Supported header-forwarding check |
| `/reader/api/0/token` | GET | Supported |
| `/reader/api/0/user-info` | GET | Supported |
| `/reader/api/0/tag/list` | GET | Feed categories only |
| `/reader/api/0/subscription/list` | GET | Supported; `htmlUrl` is empty until publisher-site metadata is stored |
| `/reader/api/0/subscription/edit` | GET, POST | Supported; repeated `s` and positionally paired `t` accepted; GET retained for existing clients |
| `/reader/api/0/subscription/quickadd` | POST | Supported |
| `/reader/api/0/subscription/import` | POST | Multipart `subscriptions_file`, `application/xml`, or `text/xml`; maximum 1 MiB |
| `/reader/api/0/subscription/export` | GET | Supported OPML export |
| `/reader/api/0/unread-count` | GET | Supported |
| `/reader/api/0/stream/contents[/<stream>]` | GET | Supported |
| `/reader/api/0/stream/items/ids` | GET | Supported |
| `/reader/api/0/stream/items/contents` | GET, POST | Supported |
| `/reader/api/0/edit-tag` | POST | Read and starred states supported |
| `/reader/api/0/mark-all-as-read` | POST | Supported |
| `/reader/api/0/rename-tag` | POST | Feed categories supported |
| `/reader/api/0/disable-tag` | POST | Feed categories supported; repeated `s` accepted |

## Client integration checklist

The repository's named source-derived smoke fixtures exercise representative
setup and synchronization sequences for each intended client. They are based
on established Reader client behavior and the FreshRSS/Tiny Tiny RSS
compatibility implementation used for the audit; they are not packet captures.
No user-agent-specific behavior is present. A live traffic capture has not
been checked into the repository, so client-version-specific behavior should
still be recorded during release smoke testing.

| Client | Endpoint groups in the RSSMonster contract | Release status |
| --- | --- | --- |
| NetNewsWire | ClientLogin, subscription/list, bare item lookup | Named source-derived smoke fixture; live client capture pending |
| Reeder | token, unread-count, edit-tag | Named source-derived smoke fixture; live client capture pending |
| FeedMe | quickadd with missing and valid action tokens | Named source-derived smoke fixture; RSSMonster intentionally requires the action token; live client capture pending |
| Fluent Reader | doubled feed prefix, `r=n`, stream contents | Named source-derived smoke fixture; live client capture pending |
| NewsFlash | stream/items/ids, stream/items/contents, mark-all-as-read | Named source-derived smoke fixture; live client capture pending |

## Identifier and time contracts

- Reading list: `user/-/state/com.google/reading-list`
- Read state: `user/-/state/com.google/read`
- Starred state: `user/-/state/com.google/starred`
- Feed: `feed/<percent-encoded subscription URL>`
- Compatibility input also normalizes duplicated `feed/feed/<reference>`
  prefixes for feed streams and subscription operations.
- Feed category: `user/-/label/<percent-encoded category name>`
- Serialized item IDs: 16-character lowercase hexadecimal IDs in
  `tag:google.com,2005:reader/item/<hex>` form.
- Item lookup accepts strict positive decimal IDs, exactly 16 hexadecimal
  characters, or the complete tagged form.
- Stream order accepts `r=o` for oldest-first and `r=d` or `r=n` for
  newest-first.
- Continuations contain the publication timestamp in milliseconds and article
  ID, separated by `:`.
- `crawlTimeMsec` is the immutable RSSMonster insertion time in milliseconds.
- `timestampUsec` is publisher publication time in microseconds.
- `published` is publisher publication time in seconds.
- `ot`, `nt`, and mark-all `ts` are interpreted against immutable insertion
  time and accept seconds, milliseconds, or microseconds.

## Unsupported behavior and deliberate limits

- Arbitrary Google Reader article-label mutation is unsupported. RSSMonster's
  `Tag` rows contain crawl-derived, feed-derived, rule-derived, and manual
  metadata under one per-article name uniqueness rule. Treating those rows as
  Reader labels would make label removal destroy derived metadata or create
  collisions. Feed categories remain distinct and are not used as article
  labels.
- Historical Google preference, recommendation, friend, broadcast, note, and
  sharing endpoints are not implemented because no intended RSSMonster client
  flow currently requires them.
- OPML import performs the same URL validation, guarded outbound discovery,
  canonical URL handling, metadata initialization, and duplicate handling as
  regular feed creation. Uploads are held in memory and are limited to 1 MiB;
  no user-controlled filename is written.
- `FEED_MAX_COUNT` controls the maximum claimed crawl batch size. Deployments
  using the previous `MAX_FEEDCOUNT` name remain temporarily supported when the
  new name is absent. This is not a subscription-count cap, so the API does not
  misrepresent it as one.
