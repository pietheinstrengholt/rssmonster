import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createDatabaseMigrator } from '../config/migrateDatabase.js';
import { CUTOFF_24 } from '../migrations/lib/baseline24Definition.mjs';
import { inspectMigrationSchema } from '../config/migrationSchema.js';

// This generator executes the archive only on an explicitly selected empty,
// disposable reference database. Runtime startup consumes its frozen output.
const args = process.argv.slice(2);
if (!args.includes('--disposable-reference') || args.some(arg => !['--disposable-reference', '--check'].includes(arg)) || new Set(args).size !== args.length) {
  throw new Error('Usage: node scripts/generateMigrationCheckpoints.js --disposable-reference [--check]');
}
const { default: db } = await import('../models/index.js');
try {
  if ((await db.sequelize.getQueryInterface().showAllTables()).length) throw new Error('Checkpoint generation requires an empty disposable reference database.');
  const inventory = JSON.parse(await readFile(new URL('../tests/fixtures/pre24MigrationInventory.json', import.meta.url), 'utf8'));
  const catalog = { version: '2.4.0', cutoffCommit: CUTOFF_24, migrations: [] };
  const migrator = createDatabaseMigrator(db);
  for (const migration of inventory.migrations) {
    await migrator.up({ to: migration.name });
    const schema = await inspectMigrationSchema(db.sequelize);
    const source = await readFile(new URL(`../migrations/pre-2.4/${migration.name}`, import.meta.url));
    catalog.migrations.push({ name: migration.name, schemaHash: schema.hash, sourceHash: createHash('sha256').update(source.toString('utf8').replace(/\r\n/g, '\n')).digest('hex') });
    catalog.historicalSchema = schema.definition;
  }
  const destination = new URL(`../migrations/lib/history24-${db.sequelize.getDialect()}.json`, import.meta.url);
  const source = JSON.stringify(catalog, null, 2) + '\n';
  if (args.includes('--check')) {
    if (await readFile(destination, 'utf8') !== source) throw new Error('Historical checkpoints differ from the frozen catalog.');
    console.log(`Historical ${db.sequelize.getDialect()} checkpoints verified.`);
  } else await writeFile(destination, source);
} finally { await db.sequelize.close(); }
