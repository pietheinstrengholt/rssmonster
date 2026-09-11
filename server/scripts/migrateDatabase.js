import 'dotenv/config';
import { migrateDatabase } from '../config/migrateDatabase.js';

const args = process.argv.slice(2);
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  console.log('Usage: npm run db\nApply pending historical and ESM Sequelize migrations using the configured database.');
} else if (args.length) {
  console.error('Unsupported migration arguments. Use npm run db -- --help.');
  process.exitCode = 1;
} else {
  const { default: db } = await import('../models/index.js');
  try { await migrateDatabase(db); } finally { await db.sequelize.close(); }
}
