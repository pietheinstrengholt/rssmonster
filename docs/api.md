---
layout: page
title: APIs & Integrations
nav_order: 5
has_children: true
---

# APIs and Integrations

Choose an interface according to the client you want to connect. Endpoint paths
and authentication schemes differ; a JWT is not a Fever or Google Reader token.

| Interface | Endpoint | Authentication | Guide |
| --- | --- | --- | --- |
| Native JSON API | `/api/*` | JWT bearer token for protected routes | [Endpoint reference]({% link rssmonster-api.md %}) |
| Fever | `/api/fever` | Fever API key derived from account credentials | [Fever setup and compatibility]({% link fever-api.md %}) |
| Google Reader | `/api/greader/*` | GoogleLogin token and action token for mutations | [Google Reader setup]({% link google-reader-api.md %}) |
| Personal RSS output | `/rss` | JWT bearer token | [Native API]({% link rssmonster-api.md %}#other-api-surfaces) |
| Generated RSS | `/rss/generated/:token` | Secret token in the URL | [Generated feeds]({% link generated-feeds.md %}) |
| Built-in assistant | `/api/agent` | JWT; AI and assistant must be enabled | [Assistant]({% link assistant.md %}) |
| MCP tools | `/mcp` | JWT bearer token | [MCP integration]({% link assistant.md %}#integrate-using-mcp) |
| Outbound webhooks | `/api/webhooks` for configuration; delivery to your endpoint | JWT for configuration; optional HMAC for delivery | [Webhooks]({% link webhooks.md %}) |

## Native API quick start

Log in with `POST /api/auth/login`, then include `Authorization: Bearer <jwt>`
when requesting protected resources such as `GET /api/feeds` or
`GET /api/articles`. JSON bodies use `Content-Type: application/json`.

Routes use plural `/api/feeds`, `/api/articles`, and `/api/categories`.
Reading-state changes have dedicated `POST` endpoints; there is no generic
`PUT /api/article/:id`, and logout is a client-side token discard rather than
`POST /api/auth/logout`. See the [complete reference]({% link rssmonster-api.md %}) for
payload conventions, authentication errors, and account/email endpoints.

## Search and state

Article search shares the [expression language]({% link search.md %}) used by
[Smart Folders]({% link smart-folders.md %}) and generated feeds. Feed item filters and
Actions use different rule formats. Check the relevant guide before reusing a
filter in another interface.

Compatibility clients can sync only the protocol features implemented by
RSSMonster. Do not assume a third-party client exposes Daily Briefing, semantic
grouping, or all web-reader settings; consult the protocol's supported endpoint
matrix and deliberate limits.

## Deployment and access

Use HTTPS for network access and preserve the `Authorization` header through a
reverse proxy. Native resources are scoped to the signed-in user, with additional
administrator checks for user management. API and MCP rate limits are described
in [Configuration]({% link configuration.md %}#rate-limiting).

Generated-feed URLs grant access to their matching article selection to anyone
holding the URL. Disable the feed or rotate its token to revoke that access.
They are useful for clients that cannot supply a bearer header to `/rss`.
