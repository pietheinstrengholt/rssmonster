# Final Review — RSSMonster 2.4 migration reset

Audit date: 2026-10-13. Scope: the archived history, native baseline definitions,
version-aware execution, root increments, diagnostics, server/Docker/Desktop startup,
tests and migration documentation in the working tree. The approved history cutoff
is `2728be062c885ea67f6849e0595a4ca5b126a8fa`.

## Verdict

**NOT GOOD TO GO for an unconditional production release across every advertised deployment.**

Confirmed implementation defects were fixed and all required database/server and
Desktop source-runtime suites pass. Native MySQL 8.4.11, container MySQL 8.0.46,
SQLite 3.52.0, Docker startup and populated legacy Desktop runtime upgrades were
validated. Packaged Desktop executable upgrades on Windows/macOS remain untested;
the local Linux Electron executable cannot start because `libnspr4.so` is missing.
That is an outstanding release validation gate, not evidence of a new code defect.
The tested server/database paths are suitable for controlled deployment with the
backup, writer shutdown and compatibility limits documented below.

## Findings ranked by severity

### Critical

No confirmed critical defects found. No automatic history deletion, destructive
baseline replay on populated installations, or silent completion of failed
migrations was observed.

### High

**H1 — Historical SQLite timestamps break populated model reads. Fixed.**

- Origin: `server/migrations/pre-2.4/20260821000000-improve-island-taxonomy-semantics.js:37`
  binds `updatedAt: new Date()` through `bulkUpdate` without column attributes.
  The same binding occurs for email-delivery dates in
  `server/migrations/pre-2.4/20260903000000-reconcile-email-delivery-outbox.js:34`.
- Evidence: a real older Desktop database stored `island_taxonomy.updatedAt` as
  an integer millisecond timestamp. After historical adoption, querying the
  initialized IslandTaxonomy model failed with `date.includes is not a function`.
  Existing schema parity and empty-table model queries did not catch it.
- Impact: an apparently successful legacy upgrade leaves populated taxonomy or
  affected email data unreadable through Sequelize.
- Fix: `server/migrations/20261013011000-normalize-sqlite-migration-dates.mjs:5`
  converts only the known affected integer date fields to UTC strings, preserving
  instants and text/null values. Unsupported numeric representations fail, and
  the whole data conversion rolls back. MySQL is a no-op. Historical scripts
  remain unchanged.
- Regression: `server/tests/config/migrationOrchestration.test.js:285` checks
  actual model reads and millisecond equality; line 312 verifies rollback and
  incomplete-state replay blocking. `desktop/tests/runtime.test.js:12` exercises
  populated legacy upgrade and repeated startup through the real Desktop runtime.

**H2 — MySQL database-name aliases bypass the migration lock. Fixed.**

- Location: `server/config/migrationLock.js:20`.
- Evidence: on actual MySQL 8.0.46 with `lower_case_table_names=1`, both
  `rssmonstertest` and `RSSMonsterTest` select the same physical database. The old
  configured-name hash permitted both sessions to acquire separate locks.
- Impact: concurrent data migrations can execute twice despite the supposed
  database-wide lock, especially where schema fingerprints do not change.
- Fix: normalize database names only when the server reports case-insensitive
  naming. Ownership checks/release still use the dedicated native connection.
- Regression: real container reproduction and fixed serialization/retry passed;
  `server/tests/config/migrationLock.test.js:31` covers settings 1 and 2 and
  preserves independent identities for case-sensitive databases.

**H3 — Feed URL uniqueness contradicts the existing model/application contract. Fixed.**

- Evidence: `server/models/feed.js:54` declares `STRING.BINARY`, and
  `server/tests/feeds/feedManagement.integration.test.js:987` requires distinct
  case-sensitive paths. Historical MySQL and the frozen baseline instead used
  `feeds.url COLLATE utf8mb4_unicode_ci` under the unique `(userId, url)` index.
- Impact: `Feed.xml` and `feed.xml` can be falsely treated as the same subscription.
  Model-sync test setup masked this migration-produced schema mismatch.
- Fix: `server/migrations/20261013010000-align-feed-url-collation.mjs:4` applies a
  forward MySQL column-collation correction to `utf8mb4_bin`, preserving every
  value, index and FK. SQLite already has binary comparison semantics. The
  baseline definitions/checkpoints were not regenerated.
- Regression: `server/tests/config/migrationOrchestration.test.js:67` upgrades
  a frozen baseline, checks exact retained DDL/keys/data, distinguishes both paths,
  rejects exact duplicates and verifies repeated startup. Native model comparison
  and actual MySQL 8.0 container tests also passed.

**H4 — Packaged Desktop production upgrade validation is incomplete. Open release gate.**

- Locations: `desktop/package.js:79`, `desktop/runtime.js:88`,
  `desktop/tests/runtime.test.js:12`, `desktop/verify-package.js:38`.
- Evidence: source-runtime and synthetic ASAR dependency tests pass, but no actual
  Windows/macOS packaged executable was built/launched against these changes.
  Local Linux Electron launch fails on missing `libnspr4.so`; Node runtime tests
  do not validate Electron's patched ASAR filesystem and packaged native addons.
- Impact: packaging, native SQLite loading or ASAR-specific discovery failures
  could prevent first run or an existing portable installation from upgrading.
- Required before broad release: smoke-test actual packaged installers/portable
  executables on the supported target OS/architectures with empty, representative
  legacy and repeated-start databases. Verify ASAR discovery, native SQLite,
  secrets/data preservation, failure blocking and application readiness.

### Medium

**M1 — MySQL schema capture corrupts SQL-looking default literals. Fixed.**

- Location: `server/migrations/lib/baseline24Definition.mjs:57`.
- Evidence: a real column default containing `AUTO_INCREMENT=123`, `FOREIGN KEY`
  and `CHARACTER SET utf8mb4 COLLATE ...` was stripped/misclassified as a FK.
  Changing only the numeric token could leave the old normalized fingerprint
  unchanged, and generated DDL could lose/misplace the column.
- Fix: remove counters only from the table-engine option line, preserve quoted
  tokens during charset canonicalization, and extract only constraint lines.
- Regression: `server/tests/config/migrationOrchestration.test.js:89` preserves
  the complete literal and rejects a subsequent out-of-band default change.
  All 72 native MySQL 8.0 checkpoints still match the frozen catalog.

**M2 — Raw historical reference discovery also includes new root increments. Fixed.**

- Location: `server/config/migrateDatabase.js:20`.
- Impact: once root increments exist, the former root-recursive default can run
  them before baseline adoption and contaminate the 72-file reference used by
  baseline/checkpoint generation.
- Fix: the raw factory defaults to `pre-2.4`; baseline mode defaults to the root.
  Explicit caller paths remain supported. Version-aware startup already chooses
  the relevant paths explicitly.
- Regression: `server/tests/config/migrationRunner.test.js:63` retains exactly
  the approved inventory and no replay; actual container reference generation
  sees 72 files and fresh initialization logs only the baseline/root increments.

**M3 — SQLite cleanup removes a replacement owner's lock. Fixed.**

- Location: `server/config/migrationLock.js:59`.
- Evidence: overwriting ownership caused the ownership check to fail, but the old
  unconditional finally block still deleted the replacement lock directory.
- Impact: a later process could enter while the replacement owner is migrating.
- Fix: compare an immutable complete owner record with a unique token during
  both ownership checks and cleanup. A replaced/lost lock is retained.
- Regression: `server/tests/config/migrationOrchestration.test.js:329` covers
  different-process and same-process replacement owners.

**M4 — Main installation documentation advertises unsupported MariaDB upgrades. Fixed documentation.**

- Locations: `README.md:159`, `docs/configuration.md:156`.
- Impact: following those instructions reaches a runner that rejects MariaDB
  because it has no validated native checkpoints.
- Correction: state the current MySQL/SQLite support and MariaDB block, rather
  than implying its historical adapter establishes safe installation/adoption.
  Implementing native MariaDB checkpoints remains outside this reset's validated
  scope; MariaDB is not claimed production-ready.

**M5 — Sequelize SQLite introspection cannot describe the crawl expression index. Documented limitation.**

- Evidence: native `describeTable('crawl_runs')` fails because Sequelize attempts
  to treat the expression index's unnamed field as a column
  (`server/node_modules/sequelize/lib/dialects/sqlite/query-interface.js:154`).
- Impact: future generic column/constraint rebuilds on that table can fail before
  completing. Current migration recognition uses native DDL capture instead;
  no present startup path depends on this failing describe call.
- Guidance: `server/migrations/README.md` now requires native column/index
  inspection and a tested native rebuild strategy for this table. The audit used
  `PRAGMA table_info`, `foreign_key_list` and native index information independently
  of the shared capture helper.

### Low

**L1 — ASAR verification omits historical support dependencies. Fixed.**

- Location: `desktop/verify-package.js:38`.
- Impact: the verifier could accept an archive missing the runner, historical
  table converter, CommonJS migration/seed package scopes or imported taxonomy
  seeder. Existing staging copies them, but the verification guarantee was incomplete.
- Correction: require all five assets and add individual omission regressions in
  `desktop/tests/packaging.test.js`. This improves the guard; it does not replace
  the actual packaged-runtime release gate H4.

**L2 — Migration command and recovery documentation lag behind the implementation. Fixed.**

- Locations: `docs/npm-commands.md:166`, `docs/backup-restore.md:49`,
  `docs/database-migration-execution.md`, `docs/database-baseline-2.4.md`.
- Corrections: baseline/adoption/increment flow, diagnostics, archive-only raw
  factory, ownership/casing rules, correction increments and current counts,
  snapshot-consistent metadata restoration, stopped writers and stale-lock
  handling. Backup guidance preserves SQLite WAL/SHM and Desktop secrets.

## Migration integrity and execution

Direct comparison against Git objects at the approved cutoff verified all
**72** historical numbered scripts, **30 CommonJS and 42 ESM**, in filename order.
Only the approved import relocations differ. Original filenames/comments/logic
and required helpers are retained. There are now **3 root scripts**: the original
2.4 baseline plus the two forward corrections above, for **75 numbered scripts**
across root/archive. Library modules/templates are not migration entries.

The installed Umzug 2.3.0 runner stores original basenames including extensions
in `SequelizeMeta.name`; a directory move does not become a new identity.
Discovery/ordering and no-replay were checked in repository-specific tests and
real migration execution, rather than assumed from Sequelize CLI conventions.
The canonical installer remains `npm run db`; Sequelize CLI does not discover
all archived ESM migrations.

Fresh databases require no application tables/views/triggers/history and execute
baseline plus root increments; they do not fabricate 72 historical records.
Recognized legacy prefixes execute only their pending archive, validate the
endpoint, adopt the baseline without replaying its destructive creation, and then
apply increments. Original historical names are retained. State persists the
in-progress filename before execution and atomically records completion with
`SequelizeMeta` only after actual success/schema/FK validation
(`server/config/migrationState.js:46`). Partial failures and incompatible states
stop; history is never automatically erased or rewritten.

Representative tests cover the first historical group, the five-group baseline,
the OIDC-era checkpoint and the final pre-2.4 endpoint. A legacy crash after DDL
committed but before history recording is rejected with unchanged rows/schema/meta
(`server/tests/config/migrationOrchestration.test.js:165`). This is deliberate
operator recovery, not speculative replay. Data-only increments have transactional
rollback tests; generic incremental/baseline completion failures and two-process
startup tests cover both databases.

## Schema and initial-data comparison

Native introspection and all initialized models cover **35 application tables and
521 columns** in each dialect. The full historical chain and the frozen baseline
match on MySQL. SQLite differs from raw history only by the six documented
restored explicit indexes and the Smart Folder/taxonomy AUTOINCREMENT, cascade and
status-check corrections. These were independently checked against original
migrations/model associations, not justified solely by a shared helper's output.

MySQL has **167 native indexes**; SQLite has **136 explicit/query-interface-visible
indexes**, with inline uniqueness/PK definitions additionally retained in DDL.
Both have **49 FK constraints (52 field components)**. Model-declared index field
order, uniqueness, prefixes, ascending/descending direction, FK targets/actions
and effective nullability were compared; migration-only ownership keys, checks
and additional performance indexes remain intentionally stronger than model-only
schema synchronization.

The material model/schema discrepancies were H1 and H3; root correction migrations
resolve them without changing frozen definitions or existing identifiers. All
mapped columns remain present. INT/INTEGER spelling, boolean integer storage,
FLOAT/REAL affinity and UUID/CHAR representations are dialect aliases. SQLite
INTEGER AUTOINCREMENT supplies the signed 64-bit rowid needed by BIGINT model IDs.
MySQL keeps unsigned types, ENUM/JSON semantics, lengths, collations and FULLTEXT;
SQLite has affinity-based types, no FULLTEXT equivalent, and lacks some later
historical ENUM SQL checks. Those intentional limits remain documented.

Primitive defaults match the migration contract. JavaScript NOW/UUID/JSON defaults
are supplied by model creation where no equivalent SQL default exists; historical
SQL scheduling defaults remain. Baseline-only MySQL URL collation still reflects
the frozen historical snapshot; current-model comparisons must include the
forward URL increment. The date increment changes representation only and
preserves millisecond instants.

Required fresh data is exactly the active C++ taxonomy row, with historical
identity/description and null vector/model. Timestamps are installation time.
No users, credentials or optional full taxonomy/source seeds are fabricated.
Existing data remains intact except explicit historical rename/backfill/cleanup
semantics and the two documented corrections. This includes saved/opened state,
article bodies, user credentials, feed/category ownership, settings and observed
SQLite auto-increment high-water marks; previously lost counters cannot be inferred.

## Deployment, diagnostics and recovery

- Standard server: manual `npm run db` before startup remains required; Express/
  PM2 startup does not implicitly create or synchronize models. Actual initialized
  model queries and Express health checks were run against migration-produced schema.
- Docker: the real repository Dockerfile built successfully. Its default command
  initializes/migrates before listening. Fresh SQLite startup, restart, diagnostics,
  populated legacy SQLite upgrades and MySQL startup passed in the built Alpine
  image. Workers' existing health dependencies were reviewed; old application
  writers must be stopped before schema upgrades.
- Desktop: migrations precede HTTP/worker readiness under the real IMMEDIATE
  SQLite policy. Fresh, populated legacy upgrade, shutdown/restart, secrets and
  high-water IDs pass source-runtime tests. Packaging dependency guards pass;
  actual target executables remain the H4 release gate.
- Diagnostics: never call Umzug storage synchronization, adoption or migration
  code. They acquire the same lock, retain unknown counts for untrusted history,
  and claim passed validation only after the recognition checks run. Live WAL
  testing verifies byte-identical database/WAL files and unchanged tracking/journal
  mode (`server/tests/config/databaseStatus.test.js:108`). Missing SQLite files
  are reported without creation; shared configuration may create a parent directory.
- Recovery: MySQL DDL is not globally transactional. Historical operations retain
  their own boundaries. Completion records are atomic, and failed operations
  remain blocked even if rollback succeeded. Restore consistent application data,
  Meta and State snapshots; never force progress by deleting history. SQLite stale
  locks require verified operator removal, not PID guessing. Locks do not pause
  ordinary writers or protect against arbitrary SQL clients bypassing the runner.

## Blocking

H4: packaged Desktop executable migration/upgrade smoke tests remain outstanding.
No confirmed unfixed implementation defect remains in the tested paths.

## Should fix

Complete H4 before declaring the entire reset production-ready across supported
Desktop targets. The SQLite expression-index introspection limitation M5 is
explicitly documented and must be accounted for in future migrations.

## Acceptable trade-offs

Strict native checkpoint matching rejects custom layouts/collations, triggers,
views and pre-2.1 schemas without an approved checkpoint. Retained older names
alone do not prove compatibility. MariaDB is unsupported for this runner. Locks
fail fast; stale SQLite locks and incomplete metadata require operator recovery.
These conservative refusals preserve data and are not claimed automatic upgrade
coverage. Diagnostics validate recognition/schema/FKs and known pre-adoption
conditions, not every application data invariant or pending migration's execution.

## Future improvements

None required beyond the stated packaged-runtime release gate.

## Validation

All tests used isolated databases/files/containers; no development or production
database, model/controller/business service, historical migration content,
embedding vector or deployment entry point was changed by this audit.

| Check | Result |
| --- | --- |
| Approved Git history comparison | 72/72 scripts preserved; 30 JS, 42 MJS |
| MySQL 8.4.11 full CI | 412 files; 4,387 passed, 2 existing TODOs; 661.78 s |
| SQLite 3.52.0 full compatibility | 110 files; 662 passed; 77.87 s |
| Desktop full source-runtime/packaging suite | 55 passed |
| Focused migration regression run | 56 passed before the final additional date/lock/WAL tests; final full suites include every addition |
| Date normalization focused regressions | 3 passed, including rollback and real model reads |
| Actual MySQL 8.0.46 container | All 72 checkpoints; historical/baseline parity; retained data/adoption/repeat; fresh bootstrap/increments/current models |
| Actual MySQL case-insensitive alias concurrency | Old key defect reproduced; fixed serialization/retry passed |
| Repository Dockerfile | Built; actual MySQL and SQLite default command health passed |
| Docker Alpine SQLite | Fresh/restart/status and populated legacy upgrade/model reads passed |
| Server/Desktop lint | Passed; server retains two pre-existing unused-variable warnings in islandNameHistory.service.test.js |
| Vector artifacts and diff whitespace | Passed |
| Packaged Windows/macOS/Desktop Electron execution | Not validated; local Linux Electron blocked by missing libnspr4.so |

Evidence logs, native model/schema captures and original-Git inventory are retained
outside the repository under `/tmp/rssmonster-final-audit-zrdXkX/`. No temporary
database artifacts or generated vectors are committed. Dependency versions were
not changed; Docker builds used the existing lockfiles.

## Final assessment

1. Does the implementation satisfy the requested design? The corrected database
   execution and diagnostics do; broad packaged Desktop readiness still needs H4.
2. Are there remaining correctness or regression risks? No confirmed unfixed
   defect in tested paths. Actual packaged/native-addon/ASAR execution is unverified.
3. Are tests sufficient for the material behavior changed? Yes for the fixed
   database defects; not yet sufficient for every production Desktop target.
4. Is there anything that must be fixed before merge? No remaining identified
   code correction; complete the stated smoke-test gate before broad release.
5. Is it ready to merge or ship? The fixes are reviewable and green. Tested server
   paths can be deployed under documented conditions; the full advertised release
   cannot yet receive unconditional production sign-off.

**Final verdict: NOT GOOD TO GO**
