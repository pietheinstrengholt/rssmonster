---
title: APIs
parent: APIs & Integrations
nav_order: 3
---

# RSSMonster API

RSSMonster exposes a JSON API for its web client and for custom integrations.
The routes are not versioned: they are served below `/api` on the same host as
RSSMonster.

```text
https://your-rssmonster.example/api
```

Most routes require a JSON Web Token (JWT). The Fever and Google Reader
compatibility APIs use their own authentication schemes; their credentials are
not interchangeable with a JWT.

## Authentication

### Request a JWT

Obtain a token by sending the user's RSSMonster credentials to
`POST /api/auth/login`:

```bash
curl --request POST \
  --header 'Content-Type: application/json' \
  --data '{"username":"<username>","password":"<password>"}' \
  'https://your-rssmonster.example/api/auth/login'
```

A successful response has this shape:

```json
{
  "message": "Connected!",
  "token": "<jwt>",
  "user": {
    "id": 1,
    "username": "example"
  },
  "expiresInSeconds": 86400,
  "agenticFeaturesEnabled": false
}
```

The `user` object can contain additional non-secret account fields. Store the
value of `token` and send it in the bearer authorization header on subsequent
requests:

```bash
curl --header 'Authorization: Bearer <jwt>' \
  'https://your-rssmonster.example/api/feeds'
```

Use `POST /api/auth/validate` with the same header to check whether a token is
still valid. Its successful response includes the authenticated user, the
decoded token data, and whether agentic features are enabled.

JWT lifetime is controlled by `JWT_EXPIRES_IN` and defaults to 86,400 seconds
(24 hours). RSSMonster does not expose refresh-token, logout, or token-revocation
endpoints. When a token expires, log in again; to log out a client should discard
its token. Changing `JWT_SECRET` invalidates all previously issued JWTs. See
[Configuration](configuration.md#application-and-authentication) for the server
settings.

### Registration and development login

`POST /api/auth/register` creates an account from `username`, `password`, and
`password_repeat`. Registration does not return a JWT, so the new user must log
in afterwards.

`POST /api/auth/development-login` can issue a normal JWT without a password,
but only when all of the development-login settings are enabled. This is meant
for local debugging or a deliberately configured personal installation, never
for a publicly reachable production server. See [First Login](first-login.md)
for setup and security details.

### Authentication errors

Protected native routes require an `Authorization: Bearer <jwt>` header. A
missing, malformed, expired, or invalid token currently returns HTTP `400` with:

```json
{
  "message": "Your session is not valid!"
}
```

Clients should therefore treat this response as an authentication failure even
though it is not returned as HTTP `401`.

## Public endpoints

These native routes do not require a JWT:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create a user account |
| `POST` | `/api/auth/login` | Exchange username and password for a JWT |
| `POST` | `/api/auth/development-login` | Log in as the configured development user when enabled |
| `GET` | `/api/health` | Return process health, uptime, and a timestamp |

The Google Reader compatibility check and login routes are also public, but
they belong to that protocol's authentication flow.

## Native endpoint reference

All endpoints in this section require a JWT unless marked otherwise above.
Exact request and response fields are the current application's contract; use
the route names below as the discovery map when building an integration.

### Articles and reading state

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/articles` | List and search articles |
| `GET` | `/api/articles/briefing` | Get articles for the briefing view |
| `GET` | `/api/articles/:articleId` | Get one article |
| `GET` | `/api/articles/duplicates/:articleId` | Get duplicate articles |
| `GET` | `/api/articles/:articleId/recommendations` | Get related recommendations |
| `POST` | `/api/articles/details` | Get details for a set of articles |
| `POST` | `/api/articles/markasread` | Mark articles as read |
| `POST` | `/api/articles/markallasread` | Mark the selected article set as read |
| `POST` | `/api/articles/marktounread/:articleId` | Mark an article unread |
| `POST` | `/api/articles/markasseen/:articleId` | Mark an article seen |
| `POST` | `/api/articles/markclicked` | Record article clicks in bulk |
| `POST` | `/api/articles/markclicked/:articleId` | Record an article click |
| `POST` | `/api/articles/markasfavorite` | Change favorite state in bulk |
| `POST` | `/api/articles/markasfavorite/:articleId` | Change an article's favorite state |
| `POST` | `/api/articles/marknotinterested/:articleId` | Record negative interest feedback |
| `POST` | `/api/articles/markmorelikethis/:articleId` | Record positive interest feedback |

The article list accepts RSSMonster's search language. See [Search](search.md)
for all expressions, including expressions shared with Smart Folders.

### Feeds and categories

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET`, `POST` | `/api/feeds` | List or create feeds |
| `GET`, `PUT`, `DELETE` | `/api/feeds/:feedId` | Read, update, or delete a feed |
| `POST` | `/api/feeds/validate` | Validate a prospective feed |
| `POST` | `/api/feeds/refresh` | Start a feed refresh job |
| `GET` | `/api/feeds/refresh/:jobId/events` | Follow refresh progress using server-sent events |
| `POST` | `/api/feeds/recalculate-trust` | Recalculate feed trust scores |
| `GET` | `/api/feeds/:feedId/observability` | Get feed crawl and health diagnostics |
| `GET` | `/api/feeds/:feedId/crawls/:crawlResultId` | Get one crawl result |
| `POST` | `/api/feeds/:feedId/retry` | Retry a feed crawl |
| `POST` | `/api/feeds/:feedId/rediscover-rss` | Rediscover a site's feed URL |
| `POST` | `/api/feeds/mute/:feedId` | Change a feed's muted state |
| `GET`, `POST` | `/api/categories` | List or create categories |
| `GET`, `PUT`, `DELETE` | `/api/categories/:categoryId` | Read, update, or delete a category |

### Organization, discovery, and insights

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/tags` | List the user's most-used tags, optionally filtered by status |
| `GET` | `/api/smartfolders` | List Smart Folders |
| `POST` | `/api/smartfolders` | Replace the user's complete Smart Folder list |
| `GET` | `/api/smartfolders/counts` | Get Smart Folder article counts |
| `GET` | `/api/smartfolders/insights` | Get Smart Folder insights |
| `POST` | `/api/events/articles` | Get articles associated with an event |
| `POST` | `/api/topics/articles` | Get articles associated with a topic |
| `GET` | `/api/briefing/preferences` | Get briefing preferences |
| `PUT` | `/api/briefing/preferences` | Update briefing preferences |

### Subscription management and maintenance

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/manager/overview` | Get the subscription-management overview |
| `GET` | `/api/manager/overview-lite` | Get a lightweight management overview |
| `POST` | `/api/manager/overview-counts` | Get management counts |
| `POST` | `/api/manager/updateorder` | Update feed or category ordering |
| `POST` | `/api/manager/changecategory` | Move subscriptions between categories |
| `GET` | `/api/crawl` | Trigger a crawl |
| `POST` | `/api/cleanup` | Run authenticated cleanup processing |
| `GET` | `/api/opml/export` | Export subscriptions as OPML |
| `POST` | `/api/opml/import` | Import the multipart `opmlFile` upload |

Although `/api/crawl` changes server state, its current route uses `GET`.
Maintenance routes can be expensive and should not be polled unnecessarily.

### Settings, actions, and administration

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET`, `POST` | `/api/setting` | Get or update user settings |
| `GET` | `/api/setting/crawl-statistics` | Get crawl statistics |
| `GET` | `/api/setting/islands` | Get Interest Island insights |
| `GET` | `/api/setting/topics` | Get topic insights |
| `GET`, `POST` | `/api/setting/official-sources` | Get or update official-source settings |
| `PATCH` | `/api/setting/developing-events` | Update developing-event settings |
| `PATCH` | `/api/setting/theme` | Update the theme |
| `PATCH` | `/api/setting/startup-view` | Update the startup view |
| `PATCH` | `/api/setting/mark-as-read-on-scroll` | Update scroll reading behavior |
| `PATCH` | `/api/setting/prioritize-high-trust` | Update high-trust prioritization |
| `GET` | `/api/actions` | List article-processing rules |
| `POST` | `/api/actions` | Replace the user's complete rules list |
| `GET` | `/api/users` | List users; administrator only |
| `GET` | `/api/users/:userId` | Get a user; administrator only |
| `POST` | `/api/users/:userId` | Update a user; administrator only |
| `DELETE` | `/api/users/:userId` | Delete another user; administrator only |

RSSMonster is multi-user. Controllers scope feeds, articles, settings, and
related results to the authenticated user. A valid JWT does not grant access to
another user's data; the user-management routes additionally require an
administrator account.

## Other API surfaces

RSSMonster also exposes protocol-specific and machine-oriented interfaces:

| Endpoint | Authentication | Documentation |
| --- | --- | --- |
| `/api/fever` | Fever `api_key` or legacy Fever login cookie | [Fever API](fever-api.md) |
| `/api/greader/*` | `GoogleLogin` token; mutations also require an action token | [Google Reader API](google-reader-api.md) |
| `/api/agent` | JWT bearer token | Accepts agent messages or input and returns an assistant response when the provider is configured |
| `/mcp` | JWT bearer token | Model Context Protocol transport for authenticated RSSMonster tools |
| `/rss` | JWT bearer token | Personal RSS output with feed, category, unread, starred, and limit filters |

`/api/agent` and semantic enrichment depend on the server's configured AI
provider. The `/rss` and `/mcp` routes are mounted outside `/api`, but use the
same JWT bearer authentication.

## Request conventions and limits

- Send JSON bodies with `Content-Type: application/json`, except for protocol
  endpoints and multipart OPML uploads.
- Cross-origin API requests may use `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`
  with the `Content-Type` and `Authorization` headers.
- The default API limit is 600 requests per 15 minutes. Configure it with
  `API_RATE_LIMIT_WINDOW_MS` and `API_RATE_LIMIT_MAX`; the health endpoint and
  preflight requests are excluded. MCP has an additional, lower configurable
  limit.
- A rate-limited request returns HTTP `429`.
- JSON responses intentionally omit `contentOriginal`. Integrations should use
  the normalized article content fields returned by the relevant endpoint.
- Serve RSSMonster over HTTPS when credentials or tokens cross a network. A
  reverse proxy must preserve the `Authorization` header.

The web client uses these same routes, so its network requests and the
corresponding files in `server/routes/` are useful references for exact payload
shapes not covered on this overview page.
