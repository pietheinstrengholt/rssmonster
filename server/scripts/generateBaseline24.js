import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { captureBaseline24, reconcileSqliteTable } from '../migrations/lib/baseline24Definition.mjs';

// Read-only against the database. Use an isolated database containing exactly the
// approved historical chain; this command never applies migrations or model sync.
const args = process.argv.slice(2);
if (args.length && !(args.length === 1 && args[0] === '--check')) throw new Error('Usage: node scripts/generateBaseline24.js [--check]');
const { default: db } = await import('../models/index.js');
try {
  const inventory = JSON.parse(await readFile(new URL('../tests/fixtures/pre24MigrationInventory.json', import.meta.url), 'utf8'));
  const [history] = await db.sequelize.query('SELECT name FROM `SequelizeMeta` ORDER BY name');
  if (JSON.stringify(history.map(row => row.name)) !== JSON.stringify(inventory.migrations.map(row => row.name))) {
    throw new Error('Generation requires exactly the approved 72-migration historical snapshot.');
  }
  const definition = await captureBaseline24(db.sequelize);
  if (definition.tables.length !== 35) throw new Error('Expected the approved 35 application tables.');
  if (definition.dialect === 'sqlite') definition.tables = definition.tables.map(reconcileSqliteTable);
  const destination = new URL(`../migrations/lib/baseline24-${definition.dialect}.json`, import.meta.url);
  const source = JSON.stringify(definition, null, 2) + '\n';
  if (args[0] === '--check') {
    if (await readFile(destination, 'utf8') !== source) throw new Error('Baseline definition differs from the historical reference and documented corrections.');
    console.log(`Baseline 2.4 ${definition.dialect} definition verified.`);
  } else {
    await writeFile(destination, source);
    console.log(`Generated baseline 2.4 ${definition.dialect}: ${definition.tables.length} tables.`);
  }
} finally { await db.sequelize.close(); }
