# Google Reader API compatibility

RSSMonster exposes a compatibility layer for clients that implement the unofficial Google Reader API. This API is commonly called the **Google Reader API**, **GReader API**, or **Reader API**.

The implementation is intended for RSS reader clients that expect Google Reader-style authentication, stream identifiers, item identifiers, subscription management, unread counts, and read/starred mutations.

> The original Google Reader API was never published as a complete official specification. Compatibility is therefore based on community documentation and implementations such as FeedHQ, The Old Reader, FreshRSS, pyrfeed, and archived reverse-engineered documentation.

## Base URL

All endpoints are mounted below:

```text
/api/greader
```

For a server hosted at `https://rss.example.com`, configure a compatible client with:

```text
https://rss.example.com/api/greader
```

Some clients ask for the server URL rather than the API URL and append paths themselves. In that case, use the value expected by that specific client.

## Implementation files

The API is implemented by:

```text
server/routes/greader.js
server/controllers/greader.js
```

The routes file defines the exposed endpoints. The controller translates Reader API concepts into RSSMonster `User`, `Category`, `Feed`, and `Article` records.

## Terminology and data mapping

The Reader API is organized around **streams**, rather than conventional REST resources.

| Reader API concept | RSSMonster representation |
| --- | --- |
| User | `User` |
| Subscription / feed | `Feed` |
| Label / folder | `Category` |
| Item | `Article` |
| Read state | `Article.status` (`read` or `unread`) |
| Starred state | `Article.favoriteInd` |
| Reading list | All canonical articles belonging to the authenticated user |

RSSMonster currently allows a feed to belong to one category. The historical Google Reader model allowed multiple labels per feed.

Duplicate or non-canonical article records are excluded through `canonicalArticleWhere()`. Clients therefore receive the canonical article representation rather than duplicate siblings.

## Authentication flow

### 1. Client login

```http
POST /api/greader/accounts/ClientLogin
Content-Type: application/x-www-form-urlencoded

Email=<username>&Passwd=<password>
```

A `GET` request is also accepted for compatibility, although `POST` is preferred.

RSSMonster validates the password using its existing legacy credential format:

```text
MD5(username + ":" + password)
```

A successful response is plain text:

```text
SID=<username>/<token>
LSID=null
Auth=<username>/<token>
```

The client must store the value after `Auth=`.

### 2. Authorization header

Authenticated requests use:

```http
Authorization: GoogleLogin auth=<username>/<token>
```

The alternative header prefix below is also accepted:

```http
Authorization: GoogleLogin_auth=<username>/<token>
```

The token is generated deterministically from:

- `GREADER_SALT`, or the built-in fallback salt;
- the username;
- the stored user hash.

Changing the password, user hash, or `GREADER_SALT` invalidates existing tokens.

Unlike several historical implementations, these authentication tokens do not currently have an expiry timestamp.

### 3. Action token

Clients can request a mutation token using:

```http
GET /api/greader/reader/api/0/token
```

The response is a 57-character plain-text token.

Many Reader clients submit this value as form field `T` on write requests. RSSMonster currently returns the token for client compatibility, but mutation handlers do **not yet validate** the `T` parameter. Authentication through the `Authorization` header is still required.

## Stream identifiers

RSSMonster supports these stream forms.

### Reading list

```text
user/-/state/com.google/reading-list
```

The shorthand path `reading-list` is also accepted by the stream contents handler.

### Read items

```text
user/-/state/com.google/read
```

### Starred items

```text
user/-/state/com.google/starred
```

### Category

```text
user/-/label/<URL-encoded category name>
```

Example:

```text
user/-/label/Technology
user/-/label/News%20and%20Media
```

### Feed

```text
feed/<URL-encoded feed URL>
```

Example:

```text
feed/https%3A%2F%2Fexample.com%2Ffeed.xml
```

For compatibility, feed lookup also accepts a numeric RSSMonster feed ID after `feed/`.

### Unsupported stream forms

The implementation does not currently support composite `splice/` streams, broadcast streams, arbitrary item tags, or social streams.

## Item identifiers

Articles are serialized using the long-form Google Reader item ID:

```text
tag:google.com,2005:reader/item/<16-character hexadecimal ID>
```

For example, article ID `12345` becomes:

```text
tag:google.com,2005:reader/item/0000000000003039
```

Endpoints accepting item IDs support both:

```text
12345
```

and:

```text
tag:google.com,2005:reader/item/0000000000003039
```

`stream/items/ids` returns short decimal IDs. Full item responses use long-form IDs.

## Supported endpoints

### Compatibility check

```http
GET /api/greader/check/compatibility
```

Returns:

```text
OK
```

### User information

```http
GET /api/greader/reader/api/0/user-info
```

Returns a JSON object containing the authenticated username as the user ID, name, profile ID, and email.

### Tag list

```http
GET /api/greader/reader/api/0/tag/list?output=json
```

Returns:

- the starred state;
- the reading-list state;
- every RSSMonster category as a Reader folder.

Only JSON is implemented. Requests without `output=json` return HTTP `501 Not Implemented`.

### Subscription list

```http
GET /api/greader/reader/api/0/subscription/list?output=json
```

Each subscription contains:

- `id`: the encoded `feed/<URL>` stream ID;
- `title`: the RSSMonster feed name;
- `categories`: zero or one category;
- `url`;
- `htmlUrl`;
- `iconUrl`.

Only JSON is implemented.

### Edit subscription

```http
POST /api/greader/reader/api/0/subscription/edit
```

A `GET` variant is also accepted because some clients use it.

Parameters are read from the form body or query string.

#### Subscribe

```text
ac=subscribe
s=feed/<feed URL>
t=<optional title>
a=user/-/label/<optional category>
```

If `a` names a category that does not exist, RSSMonster creates it. Without `a`, the first category is used. A user must therefore have at least one category.

#### Unsubscribe

```text
ac=unsubscribe
s=feed/<feed URL>
```

The matching feed is deleted.

#### Edit

```text
ac=edit
s=feed/<feed URL>
t=<optional new title>
a=user/-/label/<optional new category>
r=user/-/label/<optional category to remove>
```

Adding a category moves the feed into that category. Removing its current category moves it to another existing category, or creates `Uncategorized` when no alternative category exists.

A successful operation returns:

```text
OK
```

### Quick-add subscription

```http
POST /api/greader/reader/api/0/subscription/quickadd
Content-Type: application/x-www-form-urlencoded

quickadd=https://example.com/feed.xml
```

The feed is added to the user's first category. The endpoint does not currently perform feed discovery or fetch feed metadata; it stores the submitted URL and initially uses it as the feed name.

### Export subscriptions

```http
GET /api/greader/reader/api/0/subscription/export
```

Returns an OPML document as:

```text
application/xml; charset=utf-8
```

with download filename:

```text
subscriptions.opml
```

### Unread counts

```http
GET /api/greader/reader/api/0/unread-count?output=json
```

Returns unread counts for:

- every feed;
- every category;
- the complete reading list.

`newestItemTimestampUsec` is returned as a string containing microseconds since the Unix epoch.

Only canonical articles are counted.

### Stream contents

```http
GET /api/greader/reader/api/0/stream/contents/<stream ID>
```

The endpoint returns detailed, serialized articles for:

- the reading list;
- a feed;
- a category;
- read items;
- starred items.

Supported query parameters:

| Parameter | Meaning |
| --- | --- |
| `n` | Number of items; default `20` |
| `r` | `d` for descending or `o` for ascending |
| `c` | Continuation token |
| `xt` | Exclude a supported state stream |
| `it` | Include only a supported state stream |
| `ot` | Oldest accepted timestamp |
| `nt` | Newest accepted timestamp |

For `xt` and `it`, RSSMonster currently interprets only the read and starred streams.

Time parameters accept seconds, milliseconds, or microseconds. They are applied to `Article.createdAt`.

Pagination uses an RSSMonster-specific continuation token:

```text
<published timestamp in milliseconds>:<article ID>
```

Clients should treat the token as opaque and return it unchanged in `c`.

### Stream item IDs

```http
GET /api/greader/reader/api/0/stream/items/ids
```

The stream is supplied through query parameter `s`:

```text
s=user/-/state/com.google/reading-list
```

The endpoint supports the same `n`, `r`, `c`, `xt`, `it`, `ot`, and `nt` filters as stream contents.

Example response:

```json
{
  "itemRefs": [
    { "id": "12345" },
    { "id": "12344" }
  ],
  "continuation": "1721384400000:12344"
}
```

### Stream item contents

```http
POST /api/greader/reader/api/0/stream/items/contents
```

A `GET` request is also supported.

Pass one or more item IDs using repeated `i` parameters:

```text
i=12345&i=12346
```

Both short and long-form item IDs are accepted. The response preserves the requested item order where matching canonical articles exist.

### Edit item state

```http
POST /api/greader/reader/api/0/edit-tag
```

Use repeated `i`, `a`, and `r` form parameters.

Supported state changes:

| Operation | Parameter |
| --- | --- |
| Mark read | `a=user/-/state/com.google/read` |
| Mark unread | `r=user/-/state/com.google/read` |
| Star | `a=user/-/state/com.google/starred` |
| Unstar | `r=user/-/state/com.google/starred` |

Example:

```text
i=12345
a=user/-/state/com.google/read
a=user/-/state/com.google/starred
```

Unsupported tags are ignored. A successful request returns `OK`.

### Mark all as read

```http
POST /api/greader/reader/api/0/mark-all-as-read
```

Parameters:

```text
s=<stream ID>
ts=<optional timestamp>
```

When `s` is omitted, the complete reading list is used. `ts` accepts seconds, milliseconds, or microseconds. Only articles published at or before that timestamp are changed.

A successful request returns `OK`.

### Rename category

```http
POST /api/greader/reader/api/0/rename-tag
```

Parameters:

```text
s=user/-/label/<current name>
dest=user/-/label/<new name>
```

A successful request returns `OK`.

### Delete category

```http
POST /api/greader/reader/api/0/disable-tag
```

Parameters:

```text
s=user/-/label/<category name>
```

Feeds in the category are moved to another category before deletion. If no other category exists, RSSMonster creates `Uncategorized`.

A successful request returns `OK`.

## Serialized article format

A stream item resembles:

```json
{
  "id": "tag:google.com,2005:reader/item/0000000000003039",
  "crawlTimeMsec": "1721384400000",
  "timestampUsec": "1721384400000000",
  "published": 1721384400,
  "title": "Example article",
  "summary": {
    "content": "<p>Article content</p>"
  },
  "alternate": [
    {
      "href": "https://example.com/article",
      "type": "text/html"
    }
  ],
  "categories": [
    "user/-/state/com.google/reading-list",
    "user/-/label/Technology"
  ],
  "origin": {
    "streamId": "feed/https%3A%2F%2Fexample.com%2Ffeed.xml",
    "title": "Example Feed",
    "htmlUrl": "https://example.com/feed.xml"
  },
  "author": "Example Author"
}
```

RSSMonster places article HTML in `summary.content`. It uses `contentHtml`, falling back to `description` when needed.

The `categories` array always includes the reading list and conditionally includes:

- the read state;
- the starred state;
- the article feed's category.

## Response formats and errors

RSSMonster currently uses:

- JSON for structured Reader API responses;
- plain text for tokens and mutation acknowledgements;
- XML for OPML export.

XML and Atom representations of Reader streams are not implemented.

Common responses:

| Status | Meaning |
| --- | --- |
| `200` | Successful request |
| `400` | Missing or invalid parameters |
| `401` | Missing or invalid authentication |
| `501` | Requested output format is not implemented |
| `500` | Unexpected server or database error |

## CORS

The route accepts CORS preflight requests and responds with:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Max-Age: 600
```

## Known compatibility limits

The current API intentionally implements the subset required by common feed-reader clients. Notable limitations include:

- JSON-only tag, subscription, unread-count, and stream responses;
- no Atom stream output;
- no XML Reader API output apart from OPML export;
- one category per feed;
- no OPML import endpoint;
- no `subscribed` endpoint;
- no preference, friend, social, broadcast, bundle, recommendation, or search endpoints;
- no splice streams;
- no arbitrary per-item labels;
- no `kept-unread` state;
- no stream item count endpoint;
- no action-token validation yet;
- no authentication-token expiry;
- quick-add does not currently perform feed discovery.

When adding compatibility for another client, capture the exact request and response expectations before extending the API. Reader clients frequently rely on undocumented details such as accepted HTTP methods, repeated form parameters, timestamp units, output defaults, or specific response fields.

## Example command-line session

Set the base URL and credentials:

```bash
BASE_URL="https://rss.example.com/api/greader"
USERNAME="alice"
PASSWORD="secret"
```

Log in:

```bash
AUTH="$({ curl -fsS \
  -X POST "$BASE_URL/accounts/ClientLogin" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "Email=$USERNAME" \
  --data-urlencode "Passwd=$PASSWORD"; } | sed -n 's/^Auth=//p')"
```

List subscriptions:

```bash
curl -fsS \
  "$BASE_URL/reader/api/0/subscription/list?output=json" \
  -H "Authorization: GoogleLogin auth=$AUTH"
```

Fetch unread articles:

```bash
curl -fsS \
  "$BASE_URL/reader/api/0/stream/contents/user/-/state/com.google/reading-list?output=json&xt=user/-/state/com.google/read&n=20" \
  -H "Authorization: GoogleLogin auth=$AUTH"
```

Mark article `12345` as read:

```bash
curl -fsS \
  -X POST "$BASE_URL/reader/api/0/edit-tag" \
  -H "Authorization: GoogleLogin auth=$AUTH" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'i=12345' \
  --data-urlencode 'a=user/-/state/com.google/read'
```

## References

- [FeedHQ API terminology](https://feedhq.readthedocs.io/en/latest/api/terminology.html)
- [FeedHQ API reference](https://feedhq.readthedocs.io/en/latest/api/reference.html)
- [The Old Reader API](https://github.com/theoldreader/api)
- [FreshRSS Google Reader API implementation](https://github.com/FreshRSS/FreshRSS/blob/edge/p/api/greader.php)
- [Archived pyrfeed Google Reader API wiki](https://code.google.com/archive/p/pyrfeed/wikis/GoogleReaderAPI.wiki)
- [Archived undoc.in documentation](https://web.archive.org/web/20130718025427/http://undoc.in/)
