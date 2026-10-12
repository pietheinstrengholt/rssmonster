# Historical migrations for the 2.4 baseline reset

The approved cutoff is the 72-migration inventory at commit
`2728be062c885ea67f6849e0595a4ca5b126a8fa`. This is the audited schema snapshot
selected for the upcoming baseline, rather than a cutoff inferred from migration
timestamps or the earlier package-version bump.

Existing installations use `npm run db` and Desktop to execute all pending
historical migrations alongside incremental migrations in the parent directory,
sorted by their original filenames. Fresh empty databases use the
[2.4 baseline](../../../docs/database-baseline-2.4.md). Umzug 2.3.0 records filenames, including
extensions, in `SequelizeMeta`; directory names do not become part of their identity.
Existing history is retained. The [version-aware runner](../../../docs/database-migration-execution.md)
validates historical checkpoints, finishes pending historical migrations, and
adopts the 2.4 baseline without executing its schema creation on populated databases.

Historical `.js` files retain the CommonJS boundary from `../package.json`.
Seven files adjust only imports of existing utilities or the taxonomy seeder.
The saved/opened-original migration uses the unchanged historical transformations
in `../lib/articleStateMigration.mjs`, separated from application runtime contracts.
That helper does not match the numbered migration pattern.
The frozen names and original SHA-256 hashes are in
`../../tests/fixtures/pre24MigrationInventory.json`; the runner regression tests
verify that only these dependency paths changed and that the historical helper
code remains identical to the approved snapshot.

Use `npm run db` for initialization and pending historical/ESM migrations. The Sequelize
CLI configuration points at this archive to retain its historical `.js` discovery;
the CLI does not discover `.mjs` migrations. Seeders remain a separate command.
