# Database schema baseline 2.4.0

The schema version is **2.4.0**. Its migration identity is
`20261012010000-baseline-2.4.mjs`; its source is the approved 72-migration snapshot
at `2728be062c885ea67f6849e0595a4ca5b126a8fa`, not the package-version bump.
There are 35 application tables. Historical migrations remain in
`server/migrations/pre-2.4/` with their original filenames and history identities.

## Initialization and existing installations

Run `npm run db` from `server/` before starting the server. Docker already runs
this command before `npm run start`. Desktop invokes the same migration function
before opening its listener and workers. Direct server/PM2 startup authenticates
and loads authentication configuration; it does not create schema implicitly.

The shared [version-aware runner](database-migration-execution.md) validates complete
schema fingerprints and migration history under a database-wide migration lock.
Empty databases initialize from the baseline; recognized existing databases finish
pending historical migrations, receive targeted SQLite endpoint corrections when
needed, and adopt the baseline tracking state without recreating populated schema.
Root increments execute afterward. All existing migration history names are retained.
The companion execution guide documents checkpoint recognition, failure recovery,
concurrency, metadata tracking and compatibility limits.

The baseline itself still refuses nonempty schemas and automatic rollback. Incomplete
migration state blocks automatic replay after failure. MySQL DDL is not transactional;
operator recovery must establish safety rather than clearing history speculatively.

## Schema authority and maintenance

Committed migrations are the deployment schema authority. Current Sequelize
models are the runtime mapping; `sequelize.sync()` is not the production installer.
The two frozen native DDL definitions in `server/migrations/lib/baseline24-*.json`
are part of this one baseline migration, not a separate schema system. Runtime
initialization does not generate them from mutable models or execute the historical
chain. MySQL foreign keys are installed after all tables exist, including the
Article/Event cycle, with foreign-key checks enabled. SQLite uses its own captured
DDL and indexes, never the MySQL statements or a runtime SQL conversion.

Generation is reproducible from two **isolated disposable reference databases**:

1. Configure one MySQL reference and one SQLite file using normal `DB_*` variables.
2. Apply only the historical archive with the existing Umzug factory:

   ```sh
   cd server
   node --input-type=module -e 'import db from "./models/index.js"; import { createDatabaseMigrator } from "./config/migrateDatabase.js"; try { await createDatabaseMigrator(db).up(); } finally { await db.sequelize.close(); }'
   ```

3. On each reference, run `node scripts/generateBaseline24.js --check` to verify the
   committed definition. Omit `--check` only when deliberately regenerating the
   pre-release baseline. The generator reads schema and history and writes its
   local definition; it never migrates or modifies the database. It requires exactly
   the approved historical history and 35 tables. Use a consistent MySQL 8 server
   version and default collation for reproduction.
4. Run `npm test -- tests/config/baseline24.test.js tests/config/migrationRunner.test.js`
   against the isolated MySQL test database, and `npm run test:sqlite` against an
   isolated SQLite file prepared with `npm run db`. Complete normal backend CI and
   lint as well. The parity test builds the full historical reference and the
   baseline separately, compares every native table definition/index/constraint,
   and exercises existing-history upgrades and initialization idempotency.

Once released, freeze the baseline and its bootstrap data. Add future changes as
forward migrations and update the runtime models together. Do not regenerate an
already released baseline from a later model snapshot. Preserve the historical
inventory/checksum fixture. Full backend CI recreates MySQL schema from models;
that suite alone cannot establish migration parity, hence the dedicated parity test.

Capture canonicalization removes only MySQL auto-increment *counters* and redundant
`CHARACTER SET utf8mb4` qualifiers before `COLLATE utf8mb4_*`; these are representation
or data-state differences, not lost type/collation/constraint definitions.

## Reconciliation and dialect differences

MySQL baseline schema matches the historical reference, including migration-only
ownership constraints, indexes and checks. Models need not declare every database
index or composite foreign key: the migrations retain `(id, userId)` parent
uniqueness and ownership FKs, tag uniqueness, the inference singleton check and
all historical performance indexes. Different/redundant model-generated index
names do not justify adding another index to the baseline. JavaScript `NOW` and
JSON defaults are supplied on model creation, so absence of equivalent SQL defaults
is intentional; historical SQL timestamp defaults on feed scheduling and URL alias
clocks remain intact.

One material collation drift is fixed by the forward migration
`20261013010000-align-feed-url-collation.mjs`: historical MySQL `feeds.url` uses
`utf8mb4_unicode_ci`, while the existing Feed model declares `STRING.BINARY` and
requires case-sensitive URL paths/query values. The increment changes only that
column's collation to `utf8mb4_bin`, preserving values, indexes and foreign keys.
SQLite already compares these URLs with binary text semantics, so its increment
only records completion. The frozen baseline and historical fingerprints remain
unchanged; comparisons against current models must include root increments.

The data-only increment `20261013011000-normalize-sqlite-migration-dates.mjs`
normalizes historical SQLite integer epoch-millisecond writes in
`island_taxonomy.updatedAt` and `email_deliveries.availableAt/completedAt` to
Sequelize-compatible UTC date strings. It preserves the instant and all text/null
values, rejects unsupported numeric dates, and rolls back its entire data change
on failure. MySQL does not require this normalization. Without it, selecting a
populated historical taxonomy can fail with `date.includes is not a function`.

Seven implicit model nullability declarations are reconciled to the existing
NOT NULL database contract: Article savedInd, openedOriginalCount, hotInd,
advertisementScore, toneScore and qualityScore, and Event status. Defaults and
virtual score fallback calculations are unchanged; no existing schema or data is
altered. Runtime builds can still represent missing scores for computation, but
persisted rows must satisfy the historical database constraints.

The SQLite historical chain loses definitions during table rebuilds. Fresh baseline
corrections are explicitly frozen in `baseline24Definition.mjs`:

| Table | Difference from the raw historical SQLite schema | Evidence |
| --- | --- | --- |
| users | Restore unique username and Fever credential indexes | Original core baseline and User model |
| smart_folders | Restore AUTOINCREMENT, user FK delete/update CASCADE, user and user/name indexes | Original core baseline and User/SmartFolder association |
| island_taxonomy | Restore AUTOINCREMENT, status enum check, category and status indexes | Original semantics baseline and IslandTaxonomy model |

The parity test compares SQLite to the historical schema plus exactly these
corrections. The version-aware adoption phase now applies these corrections only to an exactly
recognized historical endpoint, after validating existing data; it never guesses
repairs for unknown layouts.

Other intentional differences between dialects remain:

- MySQL has native ENUM, unsigned integers, JSON types, length-limited text and
  Unicode collations. SQLite uses affinities (no unsigned enforcement or VARCHAR
  length limits), historical TEXT enum checks where present, and JSON stored as
  text. Later historical Sequelize-created enums lack SQL CHECK constraints on
  SQLite; runtime model validation remains the existing contract.
- MySQL has the article FULLTEXT index; SQLite uses the existing LIKE search path
  and has no equivalent FTS virtual table. MySQL prefix indexes use their original
  lengths; SQLite indexes the full values.
- Active crawl uniqueness uses MySQL's functional unique index and SQLite's native
  expression index. MySQL automatically indexes foreign keys; SQLite does not.
- MySQL retains the historical redundant taxonomy identity unique indexes. SQLite
  retains its inline identity uniqueness without adding a duplicate index.
- Historical SQLite JSON columns often lack SQL defaults which current models
  supply on creation. SQLite's historical authenticationPassword VARCHAR has TEXT
  affinity and no length enforcement, compatible with the model's TEXT value.
- MariaDB keeps the existing virtual active-crawl column adaptation and replaces
  MySQL's 0900 collation with utf8mb4_unicode_ci. MySQL/SQLite parity tests do not
  constitute live MariaDB validation; version-aware adoption rejects MariaDB until
  approved native checkpoints exist.

## Initial application data

Schema creation calls a separate frozen bootstrap helper. Like the full historical
chain on a fresh database, it inserts just the active C++ taxonomy entry with its
historical description and null vector/model. Timestamps are installation time;
no vectors or model artifacts are committed. Users, credentials and per-user
settings are created through the existing application flows. Full taxonomy and
official sources remain optional `seed:island-taxonomy` and `seed:official-sources`
commands; historical backfills, cleanup, rename/data transformations and taxonomy
re-embedding updates do not execute on fresh installs.

Desktop's staging copies the migration JSON/helpers recursively and its ASAR
verification checks them, as well as both historical and root migration scripts.
Docker's existing server-tree copy includes these files. All resolution is relative
to modules or configured storage; the baseline has no absolute installation paths.
