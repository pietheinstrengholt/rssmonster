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
  UserClusterAffinity,
  UserInterestProfile,
  ArticleCluster,
  sequelize
} = db;
import bcrypt from "bcryptjs";
import crypto from 'node:crypto';

const isMissingTableError = (error) => (
  error?.name === 'SequelizeDatabaseError' &&
  (
    error?.original?.code === 'ER_NO_SUCH_TABLE' ||
    error?.parent?.code === 'ER_NO_SUCH_TABLE'
  )
);

const destroyByUserIdSafe = async ({ model, userId, transaction, label }) => {
  try {
    await model.destroy({ where: { userId }, transaction });
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn(`[deleteUser] Skipping ${label}: backing table does not exist`);
      return;
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

    // Check if the user has the 'admin' role
    if (req.userData.role !== 'admin') {
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
      // Delete direct user-linked rows first.
      await destroyByUserIdSafe({ model: Setting, userId: user.id, transaction, label: 'settings' });
      await destroyByUserIdSafe({ model: Hotlink, userId: user.id, transaction, label: 'hotlinks' });
      await destroyByUserIdSafe({ model: Action, userId: user.id, transaction, label: 'actions' });
      await destroyByUserIdSafe({ model: SmartFolder, userId: user.id, transaction, label: 'smart_folders' });
      await destroyByUserIdSafe({ model: UserClusterAffinity, userId: user.id, transaction, label: 'user_cluster_affinities' });
      await destroyByUserIdSafe({ model: UserInterestProfile, userId: user.id, transaction, label: 'user_interest_profiles' });

      // Delete content hierarchy.
      await destroyByUserIdSafe({ model: Article, userId: user.id, transaction, label: 'articles' });
      await destroyByUserIdSafe({ model: ArticleCluster, userId: user.id, transaction, label: 'article_clusters' });
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
