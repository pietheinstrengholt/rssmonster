import db from '../models/index.js';
import { prepareArticleEventRemoval } from '../services/events/eventReconciliation.js';
const { Article } = db;
import { Op } from 'sequelize';

// Delete all non-favorited articles older than one week
const cleanup = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const oneWeekAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));

    const where = {
      favoriteInd: 0,
      createdAt: { [Op.lte]: oneWeekAgo },
      userId
    };
    const deletedCount = await db.sequelize.transaction(async transaction => {
      const { articleIds } = await prepareArticleEventRemoval(userId, where, transaction);
      return Article.destroy({ where: { userId, id: { [Op.in]: articleIds } }, transaction });
    });

    return res.status(200).json({ 
      message: 'Articles cleaned up successfully',
      deletedCount 
    });
  } catch (err) {
    console.error('Error in cleanup:', err);
    return res.status(500).json({ error: err.message });
  }
};

export default {
  cleanup
};
