'use strict';
import SmartFolder from '../models/smartFolder.js';

// Minimal controller for smartFolders with only two handlers.

const getSmartFolders = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const smartFolders = await SmartFolder.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
    res.status(200).json({ total: smartFolders.length, smartFolders });
  } catch (err) {
    next(err);
  }
};

const postSmartFolder = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    const smartFolders = Array.isArray(req.body?.smartFolders) ? req.body.smartFolders : [];

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    // Remove all existing actions for this user
    await SmartFolder.destroy({ where: { userId } });

    // Prepare new actions payload with userId
    const payload = smartFolders
      .filter(a => a && (a.name || a.query))
      .map(a => ({
        userId,
        name: a.name || '',
        query: a.query || '',
        limitCount: a.limitCount || 50
      }));

    // Insert new actions (bulk)
    const created = payload.length > 0 ? await SmartFolder.bulkCreate(payload) : [];

    res.status(201).json({ total: created.length, smartFolders: created });
  } catch (err) {
    next(err);
  }
};

export default {
  getSmartFolders,
  postSmartFolder
};