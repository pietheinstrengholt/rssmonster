---
layout: page
title: Backup and Restore
parent: Administration
nav_order: 1
---

# Backup and Restore

Docker volumes keep RSSMonster data across container recreation, but they are
not backups. Keep multiple backup generations and at least one copy outside the
Docker host. Test restoration periodically; an unreadable or incomplete backup
should not be discovered during an outage.

These procedures cover the supplied SQLite and MySQL Compose profiles. They use
POSIX shell commands. Adapt the directory-permission and checksum commands to
the host platform when necessary.

## Before You Begin

Database backups contain account data, feeds, article content, and application
state. Store them as sensitive files. Prepare a directory outside the repository
and make newly created files owner-only:

```bash
rssmonster_backup_dir="${RSSMONSTER_BACKUP_DIR:-../rssmonster-backups}"
rssmonster_backup_stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$rssmonster_backup_dir"
chmod 700 "$rssmonster_backup_dir"
umask 077
```

Run the remaining commands from the repository root in the same shell so these
variables remain available. Do not store backups in the repository or commit
them to version control.

Record the deployed image references with each backup:

```bash
docker compose config --images \
  > "$rssmonster_backup_dir/rssmonster-images-${rssmonster_backup_stamp}.txt"
```

For the MySQL profile, add `-f docker-compose.mysql.yml` to Compose commands.
Before restoring an older database, set `RSSMONSTER_TAG` or `RSSMONSTER_IMAGE`
in `.env` to the compatible application version. Starting a newer image may
apply migrations immediately.

### Preserve Configuration Secrets

The database does not contain the root `.env`. Preserve it separately because
changing `JWT_SECRET`, `FEVER_CREDENTIAL_SECRET`, database passwords, or VAPID
keys can invalidate sessions, API credentials, database access, or push
subscriptions.

On a POSIX host, an owner-only copy can be created with:

```bash
install -m 600 .env \
  "$rssmonster_backup_dir/rssmonster-env-${rssmonster_backup_stamp}"
```

An encrypted secret manager or encrypted off-host backup is preferable to a
long-lived plaintext copy. Never include this file in an image or repository.

## SQLite

The SQLite profile stores its database in `/app/data`. Stop both processes that
can write to it, then archive the complete directory so the database and any
WAL/SHM companion files remain together.

### Back Up SQLite

1. Stop the web process and crawl worker:

   ```bash
   docker compose stop rssmonster rssmonster-worker
   ```

2. Create the archive through a one-off application container:

   ```bash
   rssmonster_sqlite_backup="$rssmonster_backup_dir/rssmonster-sqlite-${rssmonster_backup_stamp}.tar.gz"
   docker compose run --rm --no-deps -T rssmonster \
     tar -C /app/data -czf - . \
     > "$rssmonster_sqlite_backup"
   ```

3. Verify that the archive is readable and record its checksum:

   ```bash
   test -s "$rssmonster_sqlite_backup"
   tar -tzf "$rssmonster_sqlite_backup" >/dev/null
   sha256sum "$rssmonster_sqlite_backup" \
     > "${rssmonster_sqlite_backup}.sha256"
   ```

   On macOS, use `shasum -a 256` instead of `sha256sum`.

4. Restart RSSMonster even if a previous backup command failed:

   ```bash
   docker compose up -d
   docker compose ps
   ```

### Restore SQLite

Restoration replaces the active SQLite database. Confirm the archive path and
make a separate backup of the current database before continuing.

1. Select and verify the archive:

   ```bash
   rssmonster_sqlite_backup=../rssmonster-backups/rssmonster-sqlite-YYYYMMDDTHHMMSSZ.tar.gz
   test -s "$rssmonster_sqlite_backup"
   tar -tzf "$rssmonster_sqlite_backup" >/dev/null
   ```

   If a `.sha256` file is available, verify it with `sha256sum -c` from the same
   directory context in which it was created.

2. Stop both writers:

   ```bash
   docker compose stop rssmonster rssmonster-worker
   ```

3. Remove only the active SQLite database and its companion files:

   ```bash
   docker compose run --rm --no-deps -T rssmonster sh -c \
     'rm -f /app/data/rssmonster.sqlite /app/data/rssmonster.sqlite-wal /app/data/rssmonster.sqlite-shm'
   ```

4. Extract the trusted archive as the container's non-root application user:

   ```bash
   docker compose run --rm --no-deps -T rssmonster \
     tar -C /app/data -xzf - \
     < "$rssmonster_sqlite_backup"
   ```

5. Start RSSMonster and inspect its health and migration output:

   ```bash
   docker compose up -d
   docker compose ps
   docker compose logs --tail=100 rssmonster rssmonster-worker
   ```

If extraction or startup fails, leave the services stopped, correct the cause,
and repeat the restore from the removal step. Do not start against a known
partial restore.

## MySQL

The MySQL profile stores database files in a named volume. Back up the logical
database with `mysqldump`; do not copy the live MySQL data directory. The web,
crawl-worker, and AI-worker containers are stopped during this procedure to
remove application writes while the dump is created. MySQL and inference can
remain running.

### Back Up MySQL

1. Stop all application database writers:

   ```bash
   docker compose -f docker-compose.mysql.yml stop \
     rssmonster rssmonster-worker rssmonster-ai-worker
   ```

2. Create a logical dump using the database credentials already present in the
   MySQL container:

   ```bash
   rssmonster_mysql_backup="$rssmonster_backup_dir/rssmonster-mysql-${rssmonster_backup_stamp}.sql"
   docker compose -f docker-compose.mysql.yml exec -T mysql sh -c \
     'exec mysqldump --user="$MYSQL_USER" --password="$MYSQL_PASSWORD" --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"' \
     > "$rssmonster_mysql_backup"
   ```

3. Verify that the dump is non-empty and record its checksum:

   ```bash
   test -s "$rssmonster_mysql_backup"
   sha256sum "$rssmonster_mysql_backup" \
     > "${rssmonster_mysql_backup}.sha256"
   ```

4. Restart the application services:

   ```bash
   docker compose -f docker-compose.mysql.yml up -d
   docker compose -f docker-compose.mysql.yml ps
   ```

### Restore MySQL

The following procedure drops and recreates only the database named by
`MYSQL_DATABASE` inside the MySQL container. Confirm the selected dump and root
`.env` values, and back up the current database before continuing.

1. Select and verify the dump:

   ```bash
   rssmonster_mysql_backup=../rssmonster-backups/rssmonster-mysql-YYYYMMDDTHHMMSSZ.sql
   test -s "$rssmonster_mysql_backup"
   ```

2. Ensure MySQL is healthy, then stop every application writer:

   ```bash
   docker compose -f docker-compose.mysql.yml up -d mysql
   docker compose -f docker-compose.mysql.yml ps mysql
   docker compose -f docker-compose.mysql.yml stop \
     rssmonster rssmonster-worker rssmonster-ai-worker
   ```

3. Drop and recreate the configured application database. This is the
   destructive step:

   ```bash
   docker compose -f docker-compose.mysql.yml exec -T mysql sh -c \
     'exec mysqladmin --user=root --password="$MYSQL_ROOT_PASSWORD" --force drop "$MYSQL_DATABASE"'
   docker compose -f docker-compose.mysql.yml exec -T mysql sh -c \
     'exec mysqladmin --user=root --password="$MYSQL_ROOT_PASSWORD" create "$MYSQL_DATABASE"'
   ```

4. Import the dump:

   ```bash
   docker compose -f docker-compose.mysql.yml exec -T mysql sh -c \
     'exec mysql --user=root --password="$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
     < "$rssmonster_mysql_backup"
   ```

5. Start the complete profile and inspect its health and migration output:

   ```bash
   docker compose -f docker-compose.mysql.yml up -d
   docker compose -f docker-compose.mysql.yml ps
   docker compose -f docker-compose.mysql.yml logs --tail=100 \
     mysql rssmonster rssmonster-worker rssmonster-ai-worker
   ```

If the import fails, keep the application services stopped. Drop and recreate
the database again before retrying so RSSMonster is never started against a
partial import.

## What Does Not Need Backing Up

- `inference-model-cache` contains downloadable model artifacts and can be
  recreated, although retaining it avoids another large download.
- `rssmonster-worker-health` contains transient worker heartbeat files.
- Containers and locally built images can be recreated from the Compose files
  and recorded image references.

Back up the SQLite or MySQL data, stable configuration secrets, and enough
deployment configuration to reproduce the installation. A successful backup
process is not complete until a restore has been tested.
