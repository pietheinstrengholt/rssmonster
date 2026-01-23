# API and Integrations

RSSMonster exposes REST-style endpoints plus compatibility layers for common RSS clients.

---

## Base Conventions
- Base URL: `http://<host>:3000`
- All JSON endpoints live under `/api/*`.
- Auth: JWT bearer tokens. Obtain via `POST /api/auth/login` with `username` and `password`; include `Authorization: Bearer <token>` on subsequent requests.
- Content type: `application/json`.

---

## Core REST Endpoints (shortlist)
- Auth: `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/logout`
- Feeds: `GET /api/feed`, `POST /api/feed`, `PUT /api/feed/:id`, `DELETE /api/feed/:id`
- Categories: `GET /api/category`, `POST /api/category`, `PUT /api/category/:id`, `DELETE /api/category/:id`
- Articles: `GET /api/article`, `PUT /api/article/:id` (status/star/click/open updates), `POST /api/article/bulk` (bulk status)
- Tags: `GET /api/tag`, `POST /api/tag`, `DELETE /api/tag/:articleId/:tag`
- Smart Folders: `GET /api/smartfolders`, `POST /api/smartfolders` (replace list), `GET /api/smartfolders/insights`
- Crawl triggers: `POST /api/crawl` (manual crawl), `POST /api/cleanup`
- OPML: `POST /api/opml/import`, `GET /api/opml/export`

Note: Endpoints may require specific payload shapes; see controller code for details.

---

## Search & Sorting
- Use the `search` query parameter on article endpoints. Syntax matches the [Search Guide](search.md) (tokens like `unread:true`, `tag:ai`, `@today`, `sort:IMPORTANCE`).
- Sorting: `sort` accepts `DESC`, `ASC`, `IMPORTANCE`, `QUALITY`, or `ATTENTION` (computed in memory).

---

## Fever API Compatibility
- Endpoint: `/api/fever` with the Fever API token-based scheme.
- Supported: syncing feeds, groups, items, unread/starred states.
- Configure your client with the Fever endpoint URL and your Fever-compatible credentials (see Settings → API Tokens).

---

## Google Reader API Compatibility
- Endpoint prefix: `/api/greader/*`.
- Supports: subscription list, unread/starred markers, item sync for Reader-compatible apps.
- Authenticate using the provided Reader token (similar to Fever flow) and point your client to the GReader endpoint.

---

## MCP / AI Assistant
- Agent endpoints live under `/api/agent` and `/api/mcp` when `OPENAI_API_KEY` is configured.
- Use these from the built-in UI; not intended for third-party clients.

---

## Status Codes
- `200` success, `201` created, `204` no content for deletions/updates.
- `400` validation errors, `401` missing/invalid token, `403` forbidden, `404` not found.

---

## Rate and Size Notes
- Typical payloads are small JSON bodies; OPML import/export handles larger XML files.
- Crawling endpoints should be protected; avoid public exposure without auth.

---

## Where to Learn More
- Explore controller files in `server/controllers/` for exact payloads and edge cases.
- Use the [Search Guide](search.md) and [Smart Folders](smart-folders.md) docs for query syntax reused by the API.
