import db from '../../models/index.js';
import { migrateDatabase } from '../../config/migrateDatabase.js';

try { await migrateDatabase(db, process.argv[2]); } catch (error) { console.error(error.message); process.exitCode = 1; } finally {
  await db.sequelize.close();
  if (process.connected) process.disconnect();
}
