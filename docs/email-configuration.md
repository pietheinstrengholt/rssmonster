---
layout: page
title: Email Configuration
parent: Administration
nav_order: 5
---

# Email Configuration

RSSMonster uses SMTP for email-address verification, password recovery, and
email briefing deliveries. Email is opt-in: when `EMAIL_ENABLED` is absent or
set to `false`, RSSMonster continues to work with username and password only
and does not require SMTP configuration.

When email is enabled, new registrations require an email address. Existing
accounts without a verified address are guided through email enrollment the
next time they sign in. Password recovery and briefing delivery are available
only to accounts with a verified address.

## Where to Configure Email

For a manual installation, put the variables in `server/.env`. Restart every
RSSMonster server process after changing them.

For Docker Compose, put the values in the repository-root `.env`. Compose does
not automatically pass arbitrary root `.env` values into containers; the
variables must also be declared in the RSSMonster service's `environment`
section. The [Docker Compose override example](#docker-compose) below does this
without modifying the supplied Compose file.

Never commit an `.env` file. Restrict access to files containing SMTP
credentials and keep the same configuration available after upgrades.

## Environment Variables

The following values are required when `EMAIL_ENABLED=true`:

| Variable | Description |
| --- | --- |
| `EMAIL_ENABLED` | Set to `true` to require and enable email features. The default is `false`. |
| `PUBLIC_APP_URL` | Public HTTP or HTTPS base URL used in verification and reset links, for example `https://rss.example.com`. It must not contain credentials, a query string, or a fragment. |
| `SMTP_HOST` | SMTP server hostname or IP address. |
| `EMAIL_FROM` | Sender mailbox, optionally with a display name, for example `RSSMonster <rssmonster@example.com>`. |

Transport and authentication settings:

| Variable | Default | Description |
| --- | --- | --- |
| `SMTP_PORT` | `587` | SMTP server port. Port 465 requires immediate TLS; port 587 normally uses STARTTLS. |
| `SMTP_SECURE` | `true` on port 465; otherwise `false` | Use immediate TLS. This must be `true` for port 465 and `false` for port 587. |
| `SMTP_REQUIRE_TLS` | `true` on port 587; otherwise `false` | Require STARTTLS. Do not enable this together with `SMTP_SECURE=true`. |
| `SMTP_POOL` | `false` | Reuse pooled SMTP connections when supported by the server. |
| `SMTP_USER` | unset | SMTP authentication username. Leave it unset for an unauthenticated local relay. |
| `SMTP_PASSWORD` | unset | SMTP password. Configure this together with `SMTP_USER`. |
| `SMTP_PASSWORD_FILE` | unset | Read the SMTP password from a file, such as a mounted container secret. It is mutually exclusive with `SMTP_PASSWORD`. |
| `EMAIL_REPLY_TO` | unset | Optional reply-to address. |

`SMTP_USER` and a password must either both be configured or both be omitted.
Use exactly one of `SMTP_PASSWORD` and `SMTP_PASSWORD_FILE`. The password-file
path is resolved inside the process or container that runs RSSMonster.

Password-reset request limiting can be tuned with these optional settings:

| Variable | Default | Description |
| --- | --- | --- |
| `PASSWORD_RESET_RATE_LIMIT_WINDOW_MS` | `3600000` | IP rate-limit window in milliseconds. |
| `PASSWORD_RESET_RATE_LIMIT_MAX` | `5` | Maximum reset requests accepted from one IP during the window. |

RSSMonster also applies a per-account cooldown. Reset-request responses do not
reveal whether an address belongs to an account.

## Example: Authenticated SMTP with STARTTLS

Add the following to `server/.env` for a manual installation, or to the root
`.env` for Docker Compose:

```env
EMAIL_ENABLED=true
PUBLIC_APP_URL=https://rss.example.com

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_POOL=true
SMTP_USER=rssmonster@example.com
SMTP_PASSWORD=replace-with-the-smtp-password

EMAIL_FROM="RSSMonster <rssmonster@example.com>"
EMAIL_REPLY_TO=admin@example.com
```

For port 465, use:

```env
SMTP_PORT=465
SMTP_SECURE=true
SMTP_REQUIRE_TLS=false
```

For a trusted local relay without authentication, omit `SMTP_USER`,
`SMTP_PASSWORD`, and `SMTP_PASSWORD_FILE`.

## Docker Compose

Create `docker-compose.override.yml` beside the supplied Compose file:

```yaml
services:
  rssmonster:
    environment:
      EMAIL_ENABLED: ${EMAIL_ENABLED:-false}
      PUBLIC_APP_URL: ${PUBLIC_APP_URL:-}
      SMTP_HOST: ${SMTP_HOST:-}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_SECURE: ${SMTP_SECURE:-}
      SMTP_REQUIRE_TLS: ${SMTP_REQUIRE_TLS:-}
      SMTP_POOL: ${SMTP_POOL:-false}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASSWORD: ${SMTP_PASSWORD:-}
      SMTP_PASSWORD_FILE: ${SMTP_PASSWORD_FILE:-}
      EMAIL_FROM: ${EMAIL_FROM:-}
      EMAIL_REPLY_TO: ${EMAIL_REPLY_TO:-}
      PASSWORD_RESET_RATE_LIMIT_WINDOW_MS: ${PASSWORD_RESET_RATE_LIMIT_WINDOW_MS:-3600000}
      PASSWORD_RESET_RATE_LIMIT_MAX: ${PASSWORD_RESET_RATE_LIMIT_MAX:-5}
```

Then recreate the application container so it receives the new environment:

```bash
docker compose up -d --force-recreate rssmonster
```

When starting the MySQL profile with an explicit Compose file, include the
override explicitly as well:

```bash
docker compose \
  -f docker-compose.mysql.yml \
  -f docker-compose.override.yml \
  up -d --force-recreate rssmonster
```

When using `SMTP_PASSWORD_FILE`, also mount the secret file into the container
and set `SMTP_PASSWORD_FILE` to that in-container path. Do not configure
`SMTP_PASSWORD` at the same time.

## Verify the Configuration

Sign in as an administrator and open **Settings → Manage Users**. The account
overview reports whether the email configuration is complete and whether email
is enabled. When enabled, select **Test SMTP connection**.

The connectivity test verifies that RSSMonster can connect to the SMTP server
and complete any configured authentication and TLS negotiation. It does not
send an email. SMTP credentials and server details are not returned to the
browser.

The server also logs safe delivery lifecycle events. These contain delivery
IDs, user IDs, message types, attempt counts, status, and sanitized SMTP error
codes, but never recipients, credentials, action tokens, or message bodies:

```text
[EmailWorker] transport.verified verified=true
[Email] delivery.enqueued deliveryId="..." userId=1 messageType="email_verification" attempt=0 status="pending"
[EmailWorker] outbox.claimed count=1
[Email] delivery.started deliveryId="..." userId=1 messageType="email_verification" attempt=1
[Email] delivery.completed deliveryId="..." userId=1 messageType="email_verification" attempt=1 status="sent"
```

`delivery.completed` means the configured SMTP server accepted the message. If
it does not arrive after that event, check the provider's delivery activity,
spam filtering, and sender-domain configuration.

If the test fails, check:

- the host and port are reachable from the RSSMonster process or container;
- port 465 uses `SMTP_SECURE=true` and `SMTP_REQUIRE_TLS=false`;
- port 587 uses `SMTP_SECURE=false` and normally `SMTP_REQUIRE_TLS=true`;
- the username and password are both present when authentication is required;
- the sender address is accepted by the SMTP provider;
- `PUBLIC_APP_URL` is the externally reachable RSSMonster URL; and
- the process was restarted or the container recreated after editing `.env`.
