import User from "../models/user.js";
import bcrypt from "bcryptjs";
import Setting from "../models/setting.js";
import Article from "../models/article.js";
import Feed from "../models/feed.js";
import Category from "../models/category.js";
import Hotlink from "../models/hotlink.js";

const getUsers = async (req, res, next) => {

  const loggedInUser = await User.findOne({
    where: {
      id: req.userData.userId,
    }
  });

  // Check if the user has the 'admin' role
  if (loggedInUser.role !== 'admin') {
    return res.status(403).json({
      message: "Access denied. Only admins can view all users."
    });
  } else {
    try {
      const users = await User.findAll({
        order: [["username"]],
        attributes: {
          exclude: ['password']
        }
      });

      return res.status(200).json({
        users: users
      });
    } catch (err) {
      console.log(err);
      return res.status(500).json(err);
    }
  }
};

const getUser = async (req, res, next) => {

  // Check if the user has the 'admin' role
  if (req.userData.role !== 'admin') {
    return res.status(403).json({
      message: "Access denied. Only admins can view all users."
    });
  }

  const userId = req.params.userId;
  try {
    const user = await User.findByPk(userId, {
      attributes: {
         exclude: ['password']
      }
    });
    if (!user) {
      return res.status(404).json({
        message: "User not found."
      });
    }
    return res.status(200).json({
      user: user
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

const postUsers = async (req, res, next) => {

  const loggedInUser = await User.findOne({
    where: {
      id: req.userData.userId,
    }
  });

  // Check if the user has the 'admin' role
  if (loggedInUser.role !== 'admin') {
    return res.status(403).json({
      message: "Access denied. Only admins can view all users."
    });
  } else {
    try {
      const user = await User.findByPk(req.params.userId);
      if (!user) {
        return res.status(404).json({
          message: "User not found"
        });
      }
      if (user) {
        // If the password is provided, update it; otherwise, just update username and role
        if (req.body.password) {

          // Hash the password
          const hash = await bcrypt.hash(req.body.password, 10);
          // Update the user with the new password, username, and role
          user.update({
            username: req.body.username,
            role: req.body.role,
            password: hash
          });
        } else {
          // Update the user with the new username and role only
          user.update({
            username: req.body.username,
            role: req.body.role
          });
        }
        return res.status(200).json(user);
      }
    } catch (err) {
      console.log(err);
      return res.status(500).json(err);
    }
  }
};

const deleteUser = async (req, res, next) => {

  const loggedInUser = await User.findOne({
    where: {
      id: req.userData.userId,
    }
  });

  // Check if the user has the 'admin' role
  if (loggedInUser.role !== 'admin') {
    return res.status(403).json({
      message: "Access denied. Only admins can delete users."
    });
  } else if (parseInt(loggedInUser.id) === parseInt(req.params.userId)) {
    return res.status(403).json({
      message: "You cannot delete your own account."
    });
  } else {
    try {
      const user = await User.findByPk(req.params.userId);
      if (!user) {
        return res.status(404).json({
          message: "User not found"
        });
      } else {
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
        return res.status(200).json({
          message: "User deleted successfully"
        });
      }
    } catch (err) {
      console.log(err);
      return res.status(500).json(err);
    }
  }
};

export default {
  getUsers,
  getUser,
  postUsers,
  deleteUser
};
