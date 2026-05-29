import db from '../models/index.js';
const {
  User,
  Setting,
  Article,
  Feed,
  Category,
  Hotlink,
  Action,
  SmartFolder,
  Topic,
  Event,
  ArticleTopic,
  EventTopic,
  Island,
  IslandTopic,
  sequelize,
  Sequelize
} = db;
import bcrypt from "bcryptjs";
import crypto from 'node:crypto';

const { Op } = Sequelize;

const isMissingTableError = (error) => (
  error?.name === 'SequelizeDatabaseError' &&
  (
    error?.original?.code === 'ER_NO_SUCH_TABLE' ||
    error?.parent?.code === 'ER_NO_SUCH_TABLE'
  )
);

const destroySafe = async ({ model, where, transaction, label }) => {
  if (!model) {
    console.warn(`[deleteUser] Skipping ${label}: model is not registered`);
    return;
  }

  try {
    await model.destroy({ where, transaction });
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn(`[deleteUser] Skipping ${label}: backing table does not exist`);
      return;
    }
    throw error;
  }
};

const destroyByUserIdSafe = async ({ model, userId, transaction, label }) => {
  await destroySafe({ model, where: { userId }, transaction, label });
};

const findIdsByUserIdSafe = async ({ model, userId, transaction, label }) => {
  if (!model) {
    console.warn(`[deleteUser] Skipping ${label}: model is not registered`);
    return [];
  }

  try {
    const rows = await model.findAll({
      where: { userId },
      attributes: ['id'],
      raw: true,
      transaction
    });

    return rows.map(row => row.id);
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn(`[deleteUser] Skipping ${label}: backing table does not exist`);
      return [];
    }
    throw error;
  }
};

const getUsers = async (req, res, _next) => {
  try {

    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const loggedInUser = await User.findOne({
      where: { id: userId }
    });

    // Check if the user has the 'admin' role
    if (loggedInUser?.role !== 'admin') {
      return res.status(403).json({
        message: "Access denied. Only admins can view all users."
      });
    }

    const users = await User.findAll({
      order: [["username", "ASC"]],
      attributes: {
        exclude: ['password', 'hash']
      }
    });

    return res.status(200).json({ users });
  } catch (err) {
    console.error('Error in getUsers:', err);
    return res.status(500).json({ error: err.message });
  }
};

const getUser = async (req, res, _next) => {
  try {
    const loggedInUserId = req.userData.userId;

    if (!loggedInUserId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const loggedInUser = await User.findOne({
      where: { id: loggedInUserId }
    });

    // Check if the user has the 'admin' role
    if (loggedInUser?.role !== 'admin') {
      return res.status(403).json({
        message: "Access denied. Only admins can view all users."
      });
    }

    const { userId } = req.params;
    const user = await User.findByPk(userId, {
      attributes: {
        exclude: ['password', 'hash']
      }
    });
    
    if (!user) {
      return res.status(404).json({
        message: "User not found."
      });
    }
    
    return res.status(200).json({ user });
  } catch (err) {
    console.error('Error in getUser:', err);
    return res.status(500).json({ error: err.message });
  }
};

const postUsers = async (req, res, _next) => {
  try {
    const loggedInUser = await User.findOne({
      where: { id: req.userData.userId }
    });

    // Check if the user has the 'admin' role
    if (loggedInUser?.role !== 'admin') {
      return res.status(403).json({
        message: "Access denied. Only admins can modify users."
      });
    }

    const user = await User.findByPk(req.params.userId);
    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // If the password is provided, update it; otherwise, just update username and role
    if (req.body.password) {
      // Hash the password
      const hash = await bcrypt.hash(req.body.password, 10);
      // Update the user with the new password, username, and role
      await user.update({
        username: req.body.username,
        role: req.body.role,
        password: hash,
        hash: crypto.createHash('md5').update(req.body.username + ":" + req.body.password).digest('hex')
      });
    } else {
      // Update the user with the new username and role only
      await user.update({
        username: req.body.username,
        role: req.body.role
      });
    }
    
    return res.status(200).json({ user });
  } catch (err) {
    console.error('Error in postUsers:', err);
    return res.status(500).json({ error: err.message });
  }
};

const deleteUser = async (req, res, _next) => {
  try {
    const loggedInUser = await User.findOne({
      where: { id: req.userData.userId }
    });

    // Check if the user has the 'admin' role
    if (loggedInUser?.role !== 'admin') {
      return res.status(403).json({
        message: "Access denied. Only admins can delete users."
      });
    }
    
    if (parseInt(loggedInUser.id) === parseInt(req.params.userId)) {
      return res.status(403).json({
        message: "You cannot delete your own account."
      });
    }

    const user = await User.findByPk(req.params.userId);
    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    await sequelize.transaction(async (transaction) => {
      const articleIds = await findIdsByUserIdSafe({ model: Article, userId: user.id, transaction, label: 'articles' });
      const eventIds = await findIdsByUserIdSafe({ model: Event, userId: user.id, transaction, label: 'events' });
      const topicIds = await findIdsByUserIdSafe({ model: Topic, userId: user.id, transaction, label: 'topics' });
      const islandIds = await findIdsByUserIdSafe({ model: Island, userId: user.id, transaction, label: 'islands' });

      if (articleIds.length > 0) {
        await destroySafe({
          model: ArticleTopic,
          where: { articleId: { [Op.in]: articleIds } },
          transaction,
          label: 'article_topics'
        });
      }

      if (eventIds.length > 0) {
        await destroySafe({
          model: EventTopic,
          where: { eventId: { [Op.in]: eventIds } },
          transaction,
          label: 'event_topics'
        });
      }

      if (topicIds.length > 0) {
        await destroySafe({
          model: ArticleTopic,
          where: { topicId: { [Op.in]: topicIds } },
          transaction,
          label: 'article_topics'
        });
        await destroySafe({
          model: EventTopic,
          where: { topicId: { [Op.in]: topicIds } },
          transaction,
          label: 'event_topics'
        });
        await destroySafe({
          model: IslandTopic,
          where: { topicId: { [Op.in]: topicIds } },
          transaction,
          label: 'island_topics'
        });
      }

      if (islandIds.length > 0) {
        await destroySafe({
          model: IslandTopic,
          where: { islandId: { [Op.in]: islandIds } },
          transaction,
          label: 'island_topics'
        });
      }

      // Delete direct user-linked rows before deleting the user.
      await destroyByUserIdSafe({ model: Setting, userId: user.id, transaction, label: 'settings' });
      await destroyByUserIdSafe({ model: Hotlink, userId: user.id, transaction, label: 'hotlinks' });
      await destroyByUserIdSafe({ model: Action, userId: user.id, transaction, label: 'actions' });
      await destroyByUserIdSafe({ model: SmartFolder, userId: user.id, transaction, label: 'smart_folders' });
      await destroyByUserIdSafe({ model: Article, userId: user.id, transaction, label: 'articles' });
      await destroyByUserIdSafe({ model: Event, userId: user.id, transaction, label: 'events' });
      await destroyByUserIdSafe({ model: Topic, userId: user.id, transaction, label: 'topics' });
      await destroyByUserIdSafe({ model: Island, userId: user.id, transaction, label: 'islands' });
      await destroyByUserIdSafe({ model: Feed, userId: user.id, transaction, label: 'feeds' });
      await destroyByUserIdSafe({ model: Category, userId: user.id, transaction, label: 'categories' });

      // Finally, delete the user.
      await user.destroy({ transaction });
    });
    
    return res.status(204).send();
  } catch (err) {
    console.error('Error in deleteUser:', err);
    return res.status(500).json({ error: err.message });
  }
};

export default {
  getUsers,
  getUser,
  postUsers,
  deleteUser
};
