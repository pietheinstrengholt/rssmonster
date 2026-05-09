import db from '../models/index.js';
import { refreshSimilarityCacheForAllUsers } from '../util/similarityCache.js';

const run = async () => {
  try {
    const userCount = await refreshSimilarityCacheForAllUsers();
    console.log(`Similarity cache refreshed for ${userCount} users.`);
  } catch (error) {
    console.error('Error recalculating similarity cache:', error);
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
};

run();
