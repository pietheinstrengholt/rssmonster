'use strict';
import Action from '../models/action.js';

// Minimal controller for actions with only two handlers.

const getActions = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const actions = await Action.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
    res.status(200).json({ total: actions.length, actions });
  } catch (err) {
    next(err);
  }
};

const createAction = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    const actions = Array.isArray(req.body?.actions) ? req.body.actions : [];

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    // Remove all existing actions for this user
    await Action.destroy({ where: { userId } });

    // Prepare new actions payload with userId
    const payload = actions
      .filter(a => a && (a.name || a.actionType || a.regularExpression))
      .map(a => ({
        userId,
        name: a.name || '',
        actionType: a.actionType || '',
        regularExpression: a.regularExpression || ''
      }));

    // Insert new actions (bulk)
    const created = payload.length > 0 ? await Action.bulkCreate(payload) : [];

    res.status(201).json({ total: created.length, actions: created });
  } catch (err) {
    next(err);
  }
};

export default {
  getActions,
  createAction
};
