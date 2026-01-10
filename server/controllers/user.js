import db from '../models/index.js';
const { User, Setting, Article, Feed, Category, Hotlink } = db;
import bcrypt from "bcryptjs";
import crypto from 'node:crypto';

const getUsers = async (req, res, next) => {
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

const getUser = async (req, res, next) => {
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

const postUsers = async (req, res, next) => {
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

const deleteUser = async (req, res, next) => {
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

    //delete all settings
    await Setting.destroy({ where: { userId: user.id } });
    //delete all hotlinks
    await Hotlink.destroy({ where: { userId: user.id } });
    //delete all articles
    await Article.destroy({ where: { userId: user.id } });
    //delete all feeds
    await Feed.destroy({ where: { userId: user.id } });
    //delete all categories
    await Category.destroy({ where: { userId: user.id } });
    // Finally, delete the user
    await user.destroy();
    
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
