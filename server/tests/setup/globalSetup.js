import './database.js';
import db from '../../models/index.js';
import { resetDatabase } from '../helpers/resetDb.js';

export default async function globalSetup() {
  await resetDatabase();

  return async () => {
    await db.sequelize.close();
  };
}
