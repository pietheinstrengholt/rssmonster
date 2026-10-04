---
layout: page
title: Webhooks
parent: Using RSSMonster
nav_order: 17
---

# Webhooks

Webhooks send newly saved, matching articles to an HTTP service. Open
**Settings → Webhooks** to create one for your account. Give it a name and an
HTTP or HTTPS endpoint URL, choose **Enabled**, and add at least one condition.
Use **All conditions** to require every condition or **Any condition** to require
one. You can pause, edit, or delete a saved webhook from the same page.

Conditions can inspect the feed, category, title, author, article URL, URL
domain, article text, or language. Feed and category values come from your own
subscriptions. Text comparisons ignore case and surrounding whitespace;
missing article metadata does not satisfy a negative condition. Webhooks match
only newly inserted, accepted articles during crawling. Editing a webhook does
not scan older articles, and a later revision of an existing article does not
create another delivery.

## Delivery and signing

The separate webhook worker sends queued deliveries. The supplied SQLite and
MySQL Compose profiles include this worker. For a manual deployment, run
`npm run start:webhook-worker` from `server/` alongside the web and crawl
processes. If the worker is stopped, matching deliveries wait in the database.

Each request is a JSON `POST` with `X-RSSMonster-Event: article.matched` and an
`X-RSSMonster-Delivery` identifier. The version 1 body contains `event`,
`deliveryId`, webhook ID/name, and article ID, title, URL, author, publication
time, language, feed ID/title, and category ID/title when available. It does
not send article body text.

Set a signing secret to receive `X-RSSMonster-Signature: sha256=<hex>`. Verify
the HMAC-SHA256 digest over the exact request body bytes using that secret.
**Generate** creates a secret in the editor; a saved secret is not returned by
the API. Leave the secret field blank when editing to retain it, or enter a new
value to replace it. Use the same `ENCRYPTION_KEY` for the web and webhook
worker processes so the worker can decrypt saved secrets.

Successful `2xx` responses complete a delivery. Timeouts, network failures,
and HTTP `408`, `425`, `429`, and `5xx` responses are retried with increasing
delays, up to five attempts. Other HTTP failures are final. Delivery records
prevent duplicate queue entries for the same webhook and article, but a request
can be retried after a delivery failure; receivers should handle repeated
`X-RSSMonster-Delivery` values safely.

## API

Authenticated clients can list and create webhooks at `/api/webhooks` with
`GET` and `POST`, and read, update, or delete one at `/api/webhooks/:id` with
`GET`, `PUT`, and `DELETE`. The routes are user-scoped. Creation and updates accept
`name`, `endpointUrl`, `enabled`, `matchMode` (`ALL` or `ANY`), optional
`secret`, and `conditions` with `field`, `operator`, and `value`. Conditions
use `is`/`is_not` for feed, category, and domain; title, author, and URL also
allow `contains`/`does_not_contain`; content allows only the latter two; and
language uses `is`/`is_not`. An empty condition list never matches. Responses
omit the signing secret. See the [native API]({% link rssmonster-api.md %}) for
authentication and request conventions.
