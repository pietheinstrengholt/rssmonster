import 'dotenv/config';
import { databaseStatus, formatDatabaseStatus } from '../config/databaseStatus.js';

const args = process.argv.slice(2);
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  console.log('Usage: npm run db:status -- [--json]\nInspect migration history, schema and foreign keys without applying migrations. Requires the migration lock; does not create a missing SQLite database.');
} else if (args.length && !(args.length === 1 && args[0] === '--json')) {
  console.error('Unsupported status arguments. Use npm run db:status -- --help.');
  process.exitCode = 1;
} else {
  let sequelize;
  try {
    const [{ default: config }, { Sequelize }] = await Promise.all([import('../config/config.cjs'), import('sequelize')]);
    // No model initialization or connection policy: SQLite diagnostics must not
    // create a database or switch its persistent journal mode to WAL.
    const options = config[process.env.NODE_ENV || 'development'];
    sequelize = new Sequelize({ ...options, logging: false, ...(options.dialect === 'sqlite' ? { dialectOptions: { mode: 1 } } : {}) });
    const status = await databaseStatus(sequelize);
    console.log(args[0] === '--json' ? JSON.stringify(status, null, 2) : formatDatabaseStatus(status));
    if (status.inconsistencies.length) process.exitCode = 1;
  } catch (error) {
    console.error(`Database status unavailable: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (sequelize) await sequelize.close();
  }
}
