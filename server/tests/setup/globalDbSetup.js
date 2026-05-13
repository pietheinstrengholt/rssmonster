import db from '../../models/index.js';
import { resetDatabase } from '../helpers/resetDb.js';

export default async function globalDbSetup() {
  const { sequelize } = db;

  await sequelize.authenticate();
  await resetDatabase();
}
