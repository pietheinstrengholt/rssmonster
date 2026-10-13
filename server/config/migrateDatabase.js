import Umzug from 'umzug';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { BASELINE_24 } from '../migrations/lib/baseline24Definition.mjs';
import mysqlBaseline from '../migrations/lib/baseline24-mysql.json' with { type: 'json' };
import sqliteBaseline from '../migrations/lib/baseline24-sqlite.json' with { type: 'json' };
import mysqlHistory from '../migrations/lib/history24-mysql.json' with { type: 'json' };
import sqliteHistory from '../migrations/lib/history24-sqlite.json' with { type: 'json' };
import mysqlLegacy from '../migrations/lib/legacy24-mysql.json' with { type: 'json' };
import { withMigrationConnection, withMigrationLock } from './migrationLock.js';
import { inspectMigrationSchema, reconcileHistoricalSqlite, rememberSqliteSequences, restoreSqliteSequences, schemaHash, validateHistoricalSqliteData, validateMigrationData } from './migrationSchema.js';
import { beginMigration, completeMigration, initializeMigrationState, readMigrationHistory } from './migrationState.js';

const migrationsDirectory = fileURLToPath(new URL('../migrations', import.meta.url));
const historicalDirectory = fileURLToPath(new URL('../migrations/pre-2.4', import.meta.url));
const migrationPattern = /^\d.*\.(?:mjs|js)$/;

// Retain historical filenames and SequelizeMeta while accepting new ESM migrations.
export const createDatabaseMigrator = (db, migrationsPath, { baseline = false, storage, beforeUp } = {}) =>
  new Umzug({
    storage: storage || 'sequelize', storageOptions: { sequelize: db.sequelize },
    migrations: {
      path: migrationsPath ?? (baseline ? migrationsDirectory : historicalDirectory),
      traverseDirectories: !baseline,
      pattern: baseline ? /^\d.*\.(?:mjs|js)$/ : /^(?!20261012010000-baseline-2\.4\.mjs$)\d.*\.(?:mjs|js)$/,
      params: [db.sequelize.getQueryInterface(), db.Sequelize],
      customResolver: filename => ({
        up: async (...args) => {
          if (beforeUp) await beforeUp(path.basename(filename));
          const migration = await import(pathToFileURL(filename));
          return (migration.default || migration).up(...args);
        },
        down: async (...args) => { const migration = await import(pathToFileURL(filename)); return (migration.default || migration).down(...args); }
      })
    }, logging: console.log
  });

const requirePrefix = (recorded, available, label) => {
  const index = recorded.findIndex((name, index) => name !== available[index]);
  if (index !== -1) {
    throw new Error(`Inconsistent ${label} migration history: expected ${available[index]}, found ${recorded[index]}; executed filenames are not a contiguous ordered prefix. No migrations were applied.`);
  }
};

const mismatch = (label, expected, actual) => new Error(`Unrecognized ${label} schema: expected fingerprint ${expected}, found ${actual}. History and schema cannot be safely reconciled; no speculative repair or baseline recreation is permitted.`);

// Existing MySQL installations can have the verified pre-reset layout rather
// than the archived reference layout. Accept only exact native fingerprints at
// their recorded checkpoints; retain the actual schema and tracking hash.
const matchesCheckpoint = (dialect, migration, hash) => Boolean(migration && (
  migration.schemaHash === hash || (dialect === 'mysql' && mysqlLegacy.schemas.some(schema => schema.lastMigration === migration.name && schema.schemaHash === hash))
));

// Shared, read-only recognition: never creates metadata or executes migrations.
export const inspectDatabaseMigrations = async (sequelize, migrationsPath = migrationsDirectory) => {
  await sequelize.authenticate();
  if (sequelize.getDialect() === 'mysql') {
    const [[server]] = await sequelize.query('SELECT VERSION() AS version');
    if (/mariadb/i.test(server.version)) throw new Error('Version-aware migration recognition requires validated MySQL or SQLite checkpoints. MariaDB adoption is not supported; no schema or history was modified.');
  }
  const catalog = sequelize.getDialect() === 'sqlite' ? sqliteHistory : mysqlHistory;
  const baseline = sequelize.getDialect() === 'sqlite' ? sqliteBaseline : mysqlBaseline;
  const baselineHash = schemaHash(baseline);
  const history = await readMigrationHistory(sequelize);
  const current = await inspectMigrationSchema(sequelize);
  const historicalNames = catalog.migrations.map(migration => migration.name);
  const rootNames = (await readdir(migrationsPath)).filter(name => migrationPattern.test(name)).sort();
  if (!rootNames.includes(BASELINE_24) || rootNames.some(name => name !== BASELINE_24 && name < BASELINE_24)) {
    throw new Error('Invalid root migration inventory: baseline 2.4 must exist and incremental filenames must follow it.');
  }
  const archivedPaths = (await readdir(historicalDirectory, { recursive: true })).filter(name => migrationPattern.test(path.basename(name)));
  const archivedNames = archivedPaths.map(name => path.basename(name)).sort();
  if (JSON.stringify(archivedNames) !== JSON.stringify(historicalNames)) throw new Error('Historical archive does not match the approved 72-migration checkpoint inventory.');
  for (const migration of catalog.migrations) {
    const relative = archivedPaths.find(filename => path.basename(filename) === migration.name);
    const source = await readFile(path.join(historicalDirectory, relative));
    if (createHash('sha256').update(source.toString('utf8').replace(/\r\n/g, '\n')).digest('hex') !== migration.sourceHash) throw new Error(`Historical migration changed: ${migration.name}. Refusing execution against a different checkpoint definition.`);
  }
  const incrementalNames = rootNames.filter(name => name !== BASELINE_24);
  const historicalDone = history.names.filter(name => historicalNames.includes(name));
  const incrementalDone = history.names.filter(name => incrementalNames.includes(name));
  const unknown = history.names.filter(name => !historicalNames.includes(name) && !rootNames.includes(name) && !(/^\d{14}.*\.(?:mjs|js|cjs)$/.test(name) && name < historicalNames[0]));
  if (unknown.length) throw new Error(`Unknown migration history: ${unknown.join(', ')}. Refusing speculative reconciliation.`);
  requirePrefix(historicalDone, historicalNames, 'historical');
  requirePrefix(incrementalDone, incrementalNames, 'incremental');
  const recordedBaseline = history.names.includes(BASELINE_24);
  const legacyEndpoint = historicalDone.length === historicalNames.length && matchesCheckpoint(sequelize.getDialect(), catalog.migrations.at(-1), current.hash);
  const baselineCompatible = current.hash === baselineHash || (sequelize.getDialect() === 'mysql' && legacyEndpoint);
  if ((!recordedBaseline && incrementalDone.length) || (recordedBaseline && historicalDone.length && historicalDone.length !== historicalNames.length)) {
    throw new Error('Inconsistent history: incremental/baseline tracking conflicts with incomplete historical migrations.');
  }
  const empty = !history.names.length && !current.definition.tables.length;
  const last = recordedBaseline ? incrementalDone.at(-1) || BASELINE_24 : historicalDone.at(-1) || null;
  if (history.state) {
    if (history.state.lastMigration !== last || history.state.schemaHash !== current.hash || history.state.baselineVersion !== (recordedBaseline ? '2.4.0' : null)) {
      throw new Error(`Migration state, SequelizeMeta and actual schema disagree: history ends at ${last}, state ends at ${history.state.lastMigration}; expected schema ${history.state.schemaHash}, found ${current.hash}. Refusing speculative recovery.`);
    }
  }
  if (recordedBaseline && !incrementalDone.length && !baselineCompatible && !(!history.state && legacyEndpoint)) {
    throw mismatch('recorded 2.4 baseline', baselineHash, current.hash);
  }
  if (!empty && !history.names.length) throw new Error('Existing schema has no migration history. Refusing to initialize or recreate it.');
  const legacyHash = catalog.migrations.at(-1).schemaHash;
  if (!history.state || !recordedBaseline) {
    const expected = empty ? current.hash : recordedBaseline ? baselineHash : catalog.migrations[historicalDone.length - 1]?.schemaHash;
    const knownEndpoint = historicalDone.length === historicalNames.length && (baselineCompatible || legacyEndpoint);
    const knownLegacy = !recordedBaseline && matchesCheckpoint(sequelize.getDialect(), catalog.migrations[historicalDone.length - 1], current.hash);
    if (!expected || (current.hash !== expected && !knownEndpoint && !knownLegacy)) throw mismatch(last || 'legacy', expected || 'a known historical checkpoint', current.hash);
  }
  await validateMigrationData(sequelize);
  if (sequelize.getDialect() === 'sqlite' && current.hash === legacyHash && current.hash !== baselineHash) await validateHistoricalSqliteData(sequelize);
  return { catalog, baselineHash, baselineCompatible, history, current, historicalNames, incrementalNames, historicalDone, incrementalDone, recordedBaseline, empty, last, legacyHash };
};

export const migrateDatabase = async (db, migrationsPath = migrationsDirectory) => {
  const { sequelize } = db;
  await withMigrationLock(sequelize, async assertHeld => withMigrationConnection(sequelize, async () => {
    const { catalog, baselineHash, history, current, recordedBaseline, empty, last, legacyHash } = await inspectDatabaseMigrations(sequelize, migrationsPath);
    const raw = createDatabaseMigrator(db, migrationsPath, { baseline: true });
    await raw.storage.executed(); // Preserve Umzug's exact SequelizeMeta definition.
    await initializeMigrationState(sequelize, history, current.hash, last, recordedBaseline ? '2.4.0' : null);
    const retainedSequences = new Map();
    const beforeUp = async name => {
      await assertHeld();
      await rememberSqliteSequences(sequelize, retainedSequences);
      await beginMigration(sequelize, name);
    };
    const storageFor = version => ({
      executed: () => raw.storage.executed(),
      logMigration: async name => {
        await restoreSqliteSequences(sequelize, retainedSequences);
        const applied = await inspectMigrationSchema(sequelize);
        const checkpoint = catalog.migrations.find(migration => migration.name === name);
        const expected = name === BASELINE_24 ? baselineHash : checkpoint?.schemaHash;
        if (expected && applied.hash !== expected && !matchesCheckpoint(sequelize.getDialect(), checkpoint, applied.hash)) throw mismatch(name, expected, applied.hash);
        await validateMigrationData(sequelize);
        await completeMigration(sequelize, name, applied.hash, version, assertHeld);
      },
      unlogMigration: () => { throw new Error('Version-aware migrations do not automatically roll back or remove history.'); }
    });
    if (empty) {
      await createDatabaseMigrator(db, migrationsPath, { baseline: true, beforeUp, storage: storageFor('2.4.0') }).up({ to: BASELINE_24 });
    } else if (!recordedBaseline || (!history.state && current.hash === legacyHash && current.hash !== baselineHash)) {
      const beforeHistoricalUp = async name => {
        // Generic Sequelize SQLite addConstraint/changeColumn rebuilds can also
        // drop referenced tables. Pinning alone is insufficient: disable FK
        // enforcement for the rebuild and validate every result before logging.
        if (sequelize.getDialect() === 'sqlite') await sequelize.query('PRAGMA foreign_keys = OFF');
        await beforeUp(name);
      };
      try {
        await createDatabaseMigrator(db, historicalDirectory, { beforeUp: beforeHistoricalUp, storage: storageFor(null) }).up();
      } finally {
        if (sequelize.getDialect() === 'sqlite') await sequelize.query('PRAGMA foreign_keys = ON');
      }
      const endpoint = await inspectMigrationSchema(sequelize);
      const compatibleEndpoint = matchesCheckpoint(sequelize.getDialect(), catalog.migrations.at(-1), endpoint.hash);
      if (endpoint.hash !== baselineHash && !compatibleEndpoint) throw mismatch('2.4 endpoint', legacyHash, endpoint.hash);
      await validateMigrationData(sequelize);
      const reconcileSqlite = sequelize.getDialect() === 'sqlite' && endpoint.hash !== baselineHash;
      if (reconcileSqlite) await validateHistoricalSqliteData(sequelize);
      await beforeUp(BASELINE_24);
      if (reconcileSqlite) await reconcileHistoricalSqlite(sequelize);
      await restoreSqliteSequences(sequelize, retainedSequences);
      const adopted = await inspectMigrationSchema(sequelize);
      if (adopted.hash !== baselineHash && !(sequelize.getDialect() === 'mysql' && matchesCheckpoint('mysql', catalog.migrations.at(-1), adopted.hash))) throw mismatch('2.4 baseline adoption', baselineHash, adopted.hash);
      await completeMigration(sequelize, BASELINE_24, adopted.hash, '2.4.0', assertHeld, { alreadyRecorded: recordedBaseline });
    }
    await createDatabaseMigrator(db, migrationsPath, { baseline: true, beforeUp, storage: storageFor('2.4.0') }).up();
  }));
};
