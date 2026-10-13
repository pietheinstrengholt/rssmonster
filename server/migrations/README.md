# Database migration development

Use `npm run db` from `server/` for initialization and upgrades. Do not use
`sequelize db:migrate`, `sequelize.sync({ alter: true })`, or model synchronization
to upgrade an installation. The CLI does not discover all archived ESM files;
model synchronization bypasses schema recognition and migration history.

## Directory and authority

```text
server/migrations/
  20261012010000-baseline-2.4.mjs   # Fresh-install schema and minimal bootstrap
  YYYYMMDDHHmmss-description.mjs   # New incremental migrations (root only)
  lib/                           # Frozen native schemas and checkpoints
  pre-2.4/                       # Approved 72-file historical chain
  templates/new-migration.mjs     # Copyable, deliberately unfinished template
```

The baseline definitions describe the frozen 2.4 starting point. Ordered
migrations describe subsequent changes; Sequelize models describe the current
application contract. Change models and add a migration together when that
contract changes. Do not regenerate the frozen baseline from current models or
edit an already released migration to make a model change appear applied.
`RSSMonsterMigrationState` records the last successfully observed schema hash;
it is not another schema definition. Retain `SequelizeMeta` filenames unchanged.

### Verified existing MySQL layouts

Some fully migrated installations retain the pre-reset native layout instead of
the archived reference layout: column ordering differs, Smart Folder indexes use
`smartFolders_*` names, Feed URLs already use binary collation, `feedTags` permits
NULL, the sort default is `DESC`, and a publisher-status CHECK is present.
`lib/legacy24-mysql.json` records that inspected layout and its four exact
fingerprints from `20261009000000-add-article-sync-actions.mjs` through
`20261012002000-standardize-tone-score.mjs`. Its table overrides are evidence for
reproducing those fingerprints in isolated tests, not schema creation instructions.

Recognition requires both the exact fingerprint and the matching contiguous
historical migration prefix. Pending naming migrations must reach the next
verified checkpoint before their completion is recorded. Baseline adoption
retains these existing tables, constraints, defaults, NULL tag values and history;
it records the actual schema hash rather than asserting byte-identical baseline
DDL. Fresh installations still use the unchanged baseline. The nullable tag field
and uppercase sort default are retained legacy differences; current models still
require non-null tags and default to lowercase `desc` on application inserts.

These checkpoints do not permit arbitrary schema drift, missing foreign keys,
extra columns, incomplete migrations or unknown earlier layouts. Do not add an
unexplained hash to bypass recognition. Capture and compare native definitions
read-only, establish compatibility and data semantics, reproduce the exact
checkpoint transition in an isolated database, and test rejection of conflicting
history before registering another verified layout.

## Creating a migration

Copy `templates/new-migration.mjs` directly into this directory, naming it
`YYYYMMDDHHmmss-descriptive-kebab-name.mjs` using UTC. Choose an unused timestamp
strictly after the baseline and every existing root migration. For example,
`20261014090000-description.mjs`. Review ordering when combining branches;
never insert a migration before an already executed incremental migration.
The runner sorts filenames lexically, not by Git history or filesystem order.
New incremental migrations must be root files: nested discovery belongs to the
historical runner. Keep filenames globally unique, since identity is the
basename including extension. Use `.mjs`: the migrations directory has a
CommonJS package scope for unchanged historical `.js` files.

Export `async function up(queryInterface, Sequelize)` and
`async function down(queryInterface, Sequelize)`. Await every operation. Replace
the template's throwing bodies before testing. Import only stable local helpers
using module-relative paths; do not import evolving business services or use
absolute filesystem paths. Keep a migration self-contained when practical.
Do not modify the archived files or their frozen helper/checkpoint assets.

## Database and transaction standards

Use QueryInterface and Sequelize types where both dialects implement the same
semantics. Branch explicitly on `queryInterface.sequelize.getDialect()` for
native SQL or different behavior, and reject unsupported dialects. MySQL
FULLTEXT, ENUM, collations, unsigned types, ALTER behavior and FK management
cannot simply be copied to SQLite. Test actual tables, indexes and constraints,
including defaults and nullability; passing model queries alone is insufficient.
The version-aware runner supports MySQL and SQLite; MariaDB adoption is rejected
because there are no validated native checkpoints.

The runner locks the complete operation and records an in-progress marker before
each `up`. It records completion only after `up`, schema inspection and foreign
key validation succeed. It does **not** wrap all migration work in one
transaction. Use explicit `sequelize.transaction(async transaction => ...)`
for atomic data operations, passing `{ transaction }` to every query. MySQL DDL
implicitly commits; do not promise rollback of mixed MySQL DDL and data work.
SQLite supports transactional DDL, but Sequelize table rebuilds can remove
indexes and constraints or cascade-delete children when foreign keys are on.
New increments run with normal FK enforcement: the legacy rebuild exception
does not apply to them. Inspect incoming references before planning a rebuild,
preserve IDs, data and AUTOINCREMENT high-water marks, and use an explicitly
tested native rebuild strategy if required. Do not casually disable FK checks.

Sequelize 6's SQLite `describeTable` cannot describe the expression-based unique
index on `crawl_runs` (it attempts to treat the expression as a named column).
For that table, inspect columns with native `PRAGMA table_info(crawl_runs)` and
inspect indexes separately; generic `changeColumn`, `removeColumn` and constraint
rebuilds that depend on `describeTable` require a tested native strategy.

Give new indexes and constraints explicit stable names and match model
definitions where they overlap. Check existing duplicates and orphans before
adding unique or foreign key constraints; fail with a useful diagnostic rather
than deleting or silently rewriting user data. Create referenced keys first;
remove dependent constraints before removing their columns or indexes. Test
uniqueness, cascades and both null/non-null cases on each dialect.

## Schema changes, data changes and rollback

Keep schema changes and substantial backfills in separate, ordered migrations
when this makes failure boundaries clearer. Add nullable columns first, backfill
deterministically, validate existing rows, then tighten nullability. Preserve
article, feed, user, configuration and interaction data. Bound large backfills
by stable keys; avoid loading an entire installation into memory. Define
retry/recovery behavior for a partially committed MySQL operation. Existing
defaults must not be overwritten just because a new default is introduced.

Only essential application initialization belongs in a migration. Optional
taxonomy/source population remains in the existing seed/operator commands.
Make bootstrap additions safe for populated databases and distinguish missing
values from intentional user choices. Never embed generated vectors or model
binaries in migrations.

When using `bulkUpdate` with Date values, pass the persisted column attributes
as its fifth argument or explicitly bind a UTC date string. Sequelize 6's SQLite
binding otherwise stores an untyped Date as integer epoch milliseconds, which
its DATE reader cannot parse. Test model reads of populated rows after backfills.

Prefer additive changes compatible with the previous application release until
all server and worker processes have upgraded. Document deployment ordering for
renames, removals or changed meaning; use a later migration to remove obsolete
structures when necessary. The migration lock serializes migrators, not normal
application writers: coordinate maintenance for operations requiring quiescence.

Implement and test `down` only when lossless rollback is feasible. Otherwise
throw a clear backup-restoration error and document the limitation. The
version-aware runner deliberately exposes no automatic downgrade or history
deletion. A `down` export does not make MySQL DDL atomic or a data transformation
reversible. Take a verified backup before upgrades; use forward fixes or an
operator-approved restore, never automatic deletion of tracking rows.

## Validation before release

Use isolated databases, never development or production data. Follow
`.github/workflows/ci.yml` for environment and preparation. Test:

- A fresh `npm run db` reaches the baseline plus all increments without history.
- An installation at the previous released schema retains representative data
  and applies the increment once; a second startup makes no changes.
- Native MySQL and SQLite schemas match the intended model contract, including
  indexes, FKs, defaults and nullability. Preserve intentional dialect differences.
- Invalid existing data fails before destructive work; partial failures retain
  the in-progress marker and do not falsely record completion.
- `npm run db:status` reports pending before upgrade and passed/up-to-date after
  actual validation. Concurrent migrators fail safely under the existing lock.

Add focused Vitest integration tests beside `server/tests/migrations/` or
`server/tests/config/`. Run focused tests, then `npm run test:ci` and
`npm run lint` with the isolated MySQL setup. Prepare an isolated SQLite file
with `DB_DIALECT=sqlite DB_STORAGE=<path> npm run db`, then run
`npm run test:sqlite` with the same environment. Database-resetting suites run
sequentially. Run `npm run check:vector-artifacts` before committing.

## Initialization, diagnosis and future baselines

Fresh empty databases execute the 2.4 baseline, then root increments. Recognized
older installations execute only pending history, validate the endpoint, adopt
the baseline without recreating populated tables, then apply increments. The
SQLite endpoint reconciliation restores constraints historically lost in rebuilds.
Unknown schemas and interrupted migrations stop for operator investigation.
See [execution and recovery](../../docs/database-migration-execution.md) and
[baseline provenance and generation](../../docs/database-baseline-2.4.md).

For a future major baseline, explicitly approve a released schema cutoff,
capture native MySQL and SQLite definitions from validated migration chains,
compare schema and essential initialization against both chains and models,
and define a new version marker and recognition checkpoints. Extend centralized
recognition/adoption and packaging tests before changing startup. Retain prior
filenames, history and upgrade paths; never treat a missing single table as
proof of an empty database. Freeze the new baseline only after fresh/current/
older/inconsistent and failure/concurrency tests pass. Archiving files or changing
the version string alone does not establish a new schema version.
