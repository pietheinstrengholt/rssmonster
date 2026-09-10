---
layout: page
title: Administration
nav_order: 6
has_children: true
---

# Administration

These pages cover the operational tasks used to run and maintain an RSSMonster
server.

- [Backup and Restore]({% link backup-restore.md %}) provides procedures for the SQLite
  and MySQL Docker Compose profiles, including secrets and verification.
- [Server Jobs]({% link server-jobs.md %}) lists every npm command exposed by the server,
  including tests, database tasks, semantic maintenance, and repair utilities.
- [Crawling]({% link crawling.md %}) explains feed scheduling, concurrency, safety limits,
  and running the dedicated crawl worker with PM2.
- [Inference]({% link inference.md %}) explains how to configure, run, inspect, and debug
  the standalone inference service.
- [npm Commands]({% link npm-commands.md %}) is the complete client, server, and inference
  command reference, including supported arguments and usage guidance.
- [OIDC Configuration]({% link oidc-configuration.md %}) explains OpenID Connect sign-in with Google as an example,
  provider-only login, account linking, and automatic account creation.
- [Email Configuration]({% link email-configuration.md %}) explains how to enable SMTP,
  configure credentials and TLS, and verify connectivity from the admin UI.
- [Progressive Web App and Notifications]({% link web-app-and-notifications.md %}) covers
  app installation and the VAPID configuration needed for browser Push.

Run administrative commands from the `server` directory unless a command says
otherwise. Before running a command that changes stored data, back up the
database and understand whether it performs an incremental update, rebuild,
repair, seed, or reset.

## Settings workspace

The desktop Settings workspace exposes user-scoped feed diagnostics, crawl
statistics, processing jobs, score settings, automation, generated feeds, and
semantic insights. **Manage Users** is restricted to administrators; it includes
account management and SMTP configuration status/testing. The first registered
account becomes the administrator. See [First Login]({% link first-login.md %}).

[Feeds and Categories]({% link feeds-and-categories.md %}) explains per-feed processing,
retry, and official sources. [Account and Email]({% link account.md %}) covers self-service
password and email changes. [Web App and Notifications]({% link web-app-and-notifications.md %})
documents VAPID configuration for browser Push.

## Push notification settings

Web Push is configured through deployment environment variables. The in-app
Settings workspace does not provide fields for entering Push keys.

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` for the web
process and each crawl worker that sends notifications. Use the same stable
key pair across those processes and keep the private key secret. Serve the app
over HTTPS so browsers can use its installation and notification capabilities.

The supplied Compose profiles pass these variables to the web service; add them
to the crawl worker's environment as well for scheduled-crawl notifications.
See [Configure Web Push on the server]({% link web-app-and-notifications.md %}#configure-web-push-on-the-server)
for key generation, `.env` examples, the worker override, and restart instructions.

After server configuration, each user enables alerts in the mobile or compact
**Options → Notifications** controls and grants browser permission. On
iOS/iPadOS, users must first install and launch the Home Screen app. Web Push
works independently from SMTP and Daily Briefing email delivery.

## Article cleanup

The Cleanup action deletes the current user's non-favorited articles whose
**database creation time** is at least seven days old. It does not use publication
time, and it does not exclude unread articles. Bookmark articles you want this
operation to retain. Deletion is permanent without a backup; OPML exports only
subscriptions, not article content or reading state.

## Email scheduling

When email is enabled, the web process starts the SMTP outbox worker and the
Daily Briefing scheduler. The scheduler checks bounded batches every five
minutes; the delivery worker polls every five seconds. Keep the web process
running for scheduled delivery. This workflow is separate from the AI worker.
See [Email Configuration]({% link email-configuration.md %}) for delivery logs and retries.

## Processing failures and queue health

**Settings → Observability** groups processing failures and lets you inspect
individual occurrences. **Settings → AI Processing** shows optional job states
and worker health. Clearing diagnostic history is different from fixing a failed
feed or retrying a dead job; follow [Crawling]({% link crawling.md %}#dead-job-recovery) for
recovery commands. Summaries may remain pending while a critical crawl lease
pauses new optional-job claims.
