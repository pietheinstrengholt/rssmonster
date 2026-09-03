---
layout: page
title: Administration
nav_order: 6
---

# Administration

These pages cover the operational tasks used to run and maintain an RSSMonster
server.

- [Backup and Restore](backup-restore.md) provides procedures for the SQLite
  and MySQL Docker Compose profiles, including secrets and verification.
- [Server Jobs](server-jobs.md) lists every npm command exposed by the server,
  including tests, database tasks, semantic maintenance, and repair utilities.
- [Crawling](crawling.md) explains feed scheduling, concurrency, safety limits,
  and running the dedicated crawl worker with PM2.
- [Inference](inference.md) explains how to configure, run, inspect, and debug
  the standalone embedding service.
- [npm Commands](npm-commands.md) is the complete client, server, and inference
  command reference, including supported arguments and usage guidance.
- [Email Configuration](email-configuration.md) explains how to enable SMTP,
  configure credentials and TLS, and verify connectivity from the admin UI.

Run administrative commands from the `server` directory unless a command says
otherwise. Before running a command that changes stored data, back up the
database and understand whether it performs an incremental update, rebuild,
repair, seed, or reset.
