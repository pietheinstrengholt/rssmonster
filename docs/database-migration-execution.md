# Version-aware database migration execution

`npm run db` and Desktop share `server/config/migrateDatabase.js`. Database
recognition, locking, validation and adoption occur there before application
startup. Umzug 2.3.0 still executes migration functions and sorts original filenames;
`SequelizeMeta.name` retains its original meaning, including extensions.

## Execution flow

| Scenario | Recognition and execution |
| --- | --- |
| A: fresh | No application tables, views/triggers or history. Create tracking, run the 2.4 baseline once, validate its full schema and foreign keys, atomically record completion, then execute sorted root increments. The archive is excluded. |
| B: current | Recognize complete historical history plus its endpoint, or the existing baseline marker plus compatible schema. Validate schema and data; apply only the documented SQLite endpoint corrections when necessary. Append the baseline filename without running its `up` function on populated tables. Retain every previous history row, then execute pending increments. |
| C: older | Require a contiguous prefix of the approved 72 historical filenames and the matching frozen schema checkpoint. Run only pending historical migrations in filename order, validate each result, then validate/adopt the 2.4 endpoint and execute root increments. |
| D: unknown | Reject unknown filenames, gaps, incompatible schemas, untracked tables, views/triggers, foreign-key violations, conflicting state, or incomplete migrations. No guessed data cleanup, baseline replay or fabricated historical records. |

Retained historical filenames older than the first approved migration remain in
history. Their presence does not prove compatibility: the actual schema must match
an approved checkpoint. Pre-2.1 layouts without a matching approved checkpoint are
rejected rather than implicitly bridged. Root increments must have names sorting
after `20261012010000-baseline-2.4.mjs`.

## Schema recognition and completion

The raw `createDatabaseMigrator(db)` factory defaults to the archive only; reference
generation must never include post-baseline root increments. Version-aware startup
selects the archive and root explicitly for their respective phases.

`history24-mysql.json` and `history24-sqlite.json` contain schema fingerprints after
every approved historical migration, source-file hashes, and the historical final
schema. They are immutable recognition evidence, not competing schema definitions:
committed migrations and the native baseline definitions remain the deployment
schema authority. Every startup verifies the frozen archive inventory and sources. Source hashes
normalize CRLF to LF for Windows checkouts without rewriting historical files.

Fingerprints cover all application tables, columns, defaults, nullability, keys,
constraints, indexes, collations and SQL expressions. Auto-increment *counters* and
redundant MySQL charset qualifiers are removed as in the baseline parity capture.
SQLite identifier quoting and whitespace are normalized without altering quoted
string values. User data is not included in schema hashes.

`RSSMonsterMigrationState` is an orchestration metadata table, not an application
model. Its singleton stores the adopted baseline version, last completed filename,
validated schema fingerprint and in-progress filename. Before executing a migration,
the runner persists its in-progress name. After `up` succeeds and validation passes,
it inserts the original `SequelizeMeta` filename and clears/advances state in one
transaction. Baseline adoption uses the same atomic completion transaction.
Existing history names are never deleted or rewritten.

After increments change schema, repeated startup compares the actual schema with
the last successful fingerprint and checks that history matches that state. It does
not incorrectly demand equality with the original 2.4 schema after later migrations.
Database schema snapshots are recorded only after successful execution; they do
not infer whether an interrupted data-only operation finished.

An exception or crash leaves an in-progress record. Subsequent starts reject it,
even if its DDL committed or its transaction rolled back. This deliberately avoids
replaying a non-repeatable operation after an ambiguous failure. MySQL DDL commits
implicitly; the entire historical chain is not one transaction. Inspect the named
migration and logs and restore/verify the database through explicit operator
recovery. Do not blindly clear state or add history records. There is no automatic
repair/recovery command in this phase.

## SQLite compatibility and preservation

The historical endpoint differs from the corrected fresh baseline. Adoption accepts
only the exact known historical endpoint and restores the documented username/Fever
unique indexes, Smart Folder indexes/cascades/AUTOINCREMENT, and taxonomy
indexes/status CHECK/AUTOINCREMENT. It preflights duplicates, invalid taxonomy
statuses and foreign-key violations. It does not choose duplicate winners, rewrite
statuses, reset vectors or discard rows. Rebuilt tables copy every original column
and ID transactionally. Unknown triggers/views prevent this targeted adoption.
The runner preserves observed SQLite auto-increment high-water marks across
rebuilds, including IDs deleted above MAX(id); it never lowers a counter. Values
already lost before this upgrade cannot be reconstructed. Newly restored
AUTOINCREMENT sequences use retained rows plus any observed historical counters.

SQLite startup migrations temporarily share one connection. Historical rebuilds
and generic Sequelize addConstraint/changeColumn operations can otherwise drop
referenced tables with foreign keys enabled on a different transaction connection,
cascading away application data. Pending historical operations disable FK enforcement
on the pinned connection, check all foreign keys before recording each migration,
and restore enforcement afterward. Normal runtime connection/transaction policies
are restored before listeners/workers start. Historical scripts remain unchanged.

## Concurrency and deployment

MySQL uses a database-specific `GET_LOCK` on a dedicated connection, verifies
ownership before completion and releases it in `finally`; a dead connection releases
the server lock. On servers with case-insensitive database names
(`lower_case_table_names=1` or `2`), configured name aliases share one normalized
lock identity; case-sensitive servers keep separate database identities.
SQLite uses an atomic directory beside the canonical database path:
`<database>.migration-lock`, with PID, host, start time and an ownership token for diagnostics. In-memory
SQLite is serialized per Sequelize instance. A second migrator fails clearly and
may retry after the first finishes. It never inspects a schema mid-migration.
Ownership checks and cleanup compare the complete owner record: a lost or replaced
lock is never removed by its previous owner.

A crash can leave a SQLite filesystem lock. Because Docker PID namespaces and
portable installations make PID liveness guesses unreliable, locks are never
removed automatically. Confirm that no migrator owns the database before explicit
operator removal. Removing a lock does not resolve an in-progress database record.
The database directory must be writable, as already required for SQLite/WAL.

Locks coordinate callers of this runner, not arbitrary SQL clients or older binaries
that bypass it. Use `npm run db` for migrations; Sequelize CLI remains for optional
seed commands. Stop application writers before a schema upgrade and use the existing
single migration coordinator. Docker still migrates before serving; Desktop still
migrates before its listener/workers; direct server startup still does not migrate
implicitly. Desktop packaging verifies the checkpoint catalogs and all runner helpers.

## Maintenance and limitations

Generate/check catalogs only on separate, empty, disposable MySQL and SQLite
reference databases using normal `DB_*` configuration:

```sh
cd server
node scripts/generateMigrationCheckpoints.js --disposable-reference --check
```

Omitting `--check` writes the catalog. The generator applies all historical
migrations to that empty reference, captures each checkpoint, and closes it. It
refuses any database containing tables. Freeze released catalogs and historical
sources; future schema changes belong in root increments with their tests/models.
The generator does not use model sync to define historical schema.

Native checkpoint recognition is intentionally conservative. Different MySQL
server/default-collation definitions, custom indexes/constraints, views/triggers or
unrecognized legacy layouts require explicit compatibility investigation rather
than speculative adoption. Catalogs are validated on MySQL 8.4.11, MySQL 8.0.46 and SQLite 3.52.0;
MariaDB's different native schema representation has no approved checkpoints and
is rejected before schema/history writes in this version-aware phase.

Tests in `server/tests/config/migrationOrchestration.test.js` cover all scenarios,
retained user/feed/article/settings/interaction data, ordering, repeat startup,
failed baseline/increment completion, schema/history inconsistencies, two-process
concurrency and abandoned SQLite locks. Baseline parity/startup tests remain in
`baseline24.test.js`; archived filename/hash tests remain in `migrationRunner.test.js`.

## File-by-file changes

| File | Change |
| --- | --- |
| `server/config/migrateDatabase.js` | Central recognition, ordered historical/baseline/increment execution, validated adoption and atomic completion storage using existing Umzug. |
| `server/config/migrationLock.js` | MySQL advisory lock, SQLite filesystem/in-memory lock and scoped SQLite connection pinning. |
| `server/config/migrationSchema.js` | Canonical fingerprints, FK/data preflight, targeted SQLite corrections and sequence preservation. |
| `server/config/migrationState.js` | Read/validate tracking; persist incomplete state and transactional completion with unchanged SequelizeMeta identities. |
| `server/migrations/lib/history24-mysql.json` | Frozen MySQL historical checkpoints and source hashes. |
| `server/migrations/lib/history24-sqlite.json` | Frozen SQLite historical checkpoints and source hashes. |
| `server/migrations/lib/baseline24Definition.mjs` | Name the orchestration metadata table and exclude metadata from application-schema capture, including supported metadata casing. |
| `server/migrations/20261012010000-baseline-2.4.mjs` | Permit orchestration metadata during empty application-schema creation; retain the populated-schema refusal. |
| `server/scripts/generateMigrationCheckpoints.js` | Explicit disposable-reference generation and reproducibility checking. |
| `server/scripts/migrateDatabase.js` | Describe the version-aware command without changing its invocation. |
| `server/tests/config/migrationOrchestration.test.js` | Both-dialect scenarios, retained data/counters, failures, inconsistencies, two-process concurrency and SQLite data/lock checks. |
| `server/tests/config/baseline24.test.js` | Update existing parity/startup expectations for validated adoption. |
| `server/tests/config/migrationRunner.test.js` | Keep historical checksum checks compatible with checkout line endings. |
| `server/tests/helpers/clearMigrationDatabase.js` | Reuse isolated test-database cleanup with the existing MySQL safety guard. |
| `server/tests/helpers/runMigrationOrchestration.js` | Real subprocess entry point for concurrent startup tests. |
| `desktop/verify-package.js` | Require checkpoint catalogs and orchestration helpers in ASAR. |
| `desktop/tests/packaging.test.js` | Reject packages missing each new required asset. |
| `server/migrations/pre-2.4/README.md` | Explain historical recognition and adoption. |
| `docs/database-baseline-2.4.md` | Link/update the baseline documentation for the new execution phase. |
| `docs/database-migration-execution.md` | Execution flow, maintenance, recovery, limitations and this change inventory. |

No application models, controllers or business services were changed in this phase.
No historical migration script was moved, removed or rewritten in this phase.

## Migration diagnostics

From `server/`, run `npm run db:status` using the same database environment as
`npm run db`. Use `npm run db:status -- --json` for structured output, or
`npm run db:status -- --help` without connecting to a database. Exit status is
0 for a recognized state (including pending upgrades) and 1 for blocked or
unavailable diagnostics. Pending migrations are not applied by this command.

For a validated fresh installation including the feed URL collation and historical
SQLite date normalization increments,
output is:

```text
RSSMonster Database Status
Database dialect: mysql
Schema baseline: 2.4.0
Migration state: Up to date
Applied migrations: 3
Pending migrations: 0
Legacy upgrades: Complete
Schema validation: Passed
```

The command shares startup's history, archive integrity, native schema fingerprint
and foreign key checks. It reports dialect, recognized baseline, applied and
pending counts, legacy requirements and inconsistencies. Applied counts include
all retained `SequelizeMeta` records. Pending counts include only work the
selected path will execute: an empty database counts baseline plus increments,
not the skipped archive; an older installation also counts pending history and
baseline adoption. Baseline adoption counts as one tracking step even when its
schema is already compatible. For incompatible/incomplete history, pending
counts remain unknown instead of guessing. An empty database is reported as
uninitialized; passing emptiness checks does not claim an installed baseline.
Passed validation means the deployed inventory, migration history, recognized
native schema fingerprint and foreign key/pre-adoption data checks passed.
It does not execute pending migration code, compare every current model against
an older checkpoint, or replace migration integration tests and backup checks.

Diagnostics take the same MySQL advisory lock or temporary SQLite lock directory
as startup, preventing classification during a concurrent migration. A busy
lock reports validation not performed. SQLite files are opened read-only and
missing files are reported without creation. Database schema, data, migration
records and journal mode are never changed; normal configuration loading may
create a configured parent directory. This requires permission to create/remove
the temporary SQLite lock directory beside an existing database. The lock does
not pause ordinary application writes, so data checks describe observations at
inspection time, not a lasting guarantee against later writes.

On failure, retain the diagnostic, failed migration name and original logs.
Compare deployed files, `SequelizeMeta`, `RSSMonsterMigrationState` and actual
schema against the relevant checkpoint; inspect backup and transaction boundaries.
The status command never clears an in-progress marker, removes a stale lock,
replays a migration or repairs data. Follow the recovery rules above and make
an explicit operator recovery decision before retrying `npm run db`.

For new migrations, follow the [development standards](../server/migrations/README.md).
