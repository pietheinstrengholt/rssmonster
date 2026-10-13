import { stat } from 'node:fs/promises';
import { inspectDatabaseMigrations } from './migrateDatabase.js';
import { readMigrationHistory } from './migrationState.js';
import { withMigrationConnection, withMigrationLock } from './migrationLock.js';

// Take the same lock as startup, but never create metadata, adopt a baseline,
// reconcile SQLite tables or execute migration code.
export const databaseStatus = async (sequelize, migrationsPath) => {
  const status = {
    dialect: sequelize.getDialect(), baseline: 'Unknown', state: 'Unknown',
    applied: null, pending: null, legacy: 'Unknown',
    validation: 'Not performed', inconsistencies: []
  };
  try {
    if (status.dialect === 'sqlite' && sequelize.options.storage && sequelize.options.storage !== ':memory:') {
      await stat(sequelize.options.storage).catch(error => {
        if (error.code === 'ENOENT') throw new Error('SQLite database file does not exist. No file was created; run npm run db to initialize it.');
        throw error;
      }); // Never create a missing portable database.
    }
    await withMigrationLock(sequelize, async assertHeld => withMigrationConnection(sequelize, async () => {
      const history = await readMigrationHistory(sequelize, { allowIncomplete: true });
      status.applied = history.names.length;
      status.validation = 'Failed';
      const plan = await inspectDatabaseMigrations(sequelize, migrationsPath);
      await assertHeld();
      const historicalPending = plan.historicalNames.length - plan.historicalDone.length;
      const incrementalPending = plan.incrementalNames.length - plan.incrementalDone.length;
      const adoption = !plan.recordedBaseline || (!history.state && status.dialect === 'sqlite' && plan.current.hash !== plan.baselineHash);
      status.baseline = plan.recordedBaseline && !adoption ? '2.4.0' : plan.empty ? 'Uninitialized' : plan.baselineCompatible ? '2.4.0 (adoption required)' : 'Pre-2.4 (recognized checkpoint)';
      status.pending = incrementalPending + (adoption ? 1 : 0) + (!plan.empty && !plan.recordedBaseline ? historicalPending : 0);
      status.legacy = plan.empty ? 'Not required' : historicalPending && !plan.recordedBaseline ? `${historicalPending} historical migrations required; baseline adoption required` : adoption ? 'Baseline adoption required' : 'Complete';
      status.state = plan.empty ? 'Initialization required' : status.pending ? 'Pending migrations' : 'Up to date';
      status.validation = plan.empty ? 'Passed (empty database; baseline not installed)' : 'Passed';
    }));
  } catch (error) {
    status.state = 'Blocked';
    status.inconsistencies.push(error.message);
  }
  return status;
};

export const formatDatabaseStatus = status => [
  'RSSMonster Database Status',
  `Database dialect: ${status.dialect}`,
  `Schema baseline: ${status.baseline}`,
  `Migration state: ${status.state}`,
  `Applied migrations: ${status.applied ?? 'Unknown'}`,
  `Pending migrations: ${status.pending ?? 'Unknown'}`,
  `Legacy upgrades: ${status.legacy}`,
  `Schema validation: ${status.validation}`,
  ...status.inconsistencies.map(message => `Diagnostic: ${message}`)
].join('\n');
