import db from '../models/index.js';
const { Article } = db;
import { Op } from 'sequelize';

// Delete all non-starred articles older than one week
const cleanup = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const oneWeekAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));

    const deletedCount = await Article.destroy({
      where: {
        starInd: 0,
        createdAt: { [Op.lte]: oneWeekAgo },
        userId: userId
      }
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