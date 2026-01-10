'use strict';

import Sequelize from 'sequelize';

// ---- Load DB config (CommonJS via .cjs) ----
import dbConfig from '../config/config.cjs';

const env = process.env.NODE_ENV || 'development';
const config = dbConfig[env];

if (!config) {
  throw new Error(`No database configuration found for environment: ${env}`);
}

// ---- Sequelize init (SINGLE instance) ----
const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: config.logging ?? false
  }
);

// ---- Import model factories ----
import UserModel from './user.js';
import CategoryModel from './category.js';
import FeedModel from './feed.js';
import ArticleModel from './article.js';
import TagModel from './tag.js';
import ActionModel from './action.js';
import SettingModel from './setting.js';
import SmartFolderModel from './smartFolder.js';
import ArticleClusterModel from './articleCluster.js';
import HotlinkModel from './hotlink.js';

// ---- Initialize models ----
const User = UserModel(sequelize);
const Category = CategoryModel(sequelize);
const Feed = FeedModel(sequelize);
const Article = ArticleModel(sequelize);
const Tag = TagModel(sequelize);
const Action = ActionModel(sequelize);
const Setting = SettingModel(sequelize);
const SmartFolder = SmartFolderModel(sequelize);
const ArticleCluster = ArticleClusterModel(sequelize);
const Hotlink = HotlinkModel(sequelize);

// ---- Associations ----

// User ↔ Action
User.hasMany(Action, { foreignKey: 'userId', onDelete: 'CASCADE' });
Action.belongsTo(User, { foreignKey: 'userId' });

// User ↔ Category
User.hasMany(Category, { foreignKey: 'userId', onDelete: 'CASCADE' });
Category.belongsTo(User, { foreignKey: 'userId' });

// User ↔ Feed
User.hasMany(Feed, { foreignKey: 'userId', onDelete: 'CASCADE' });
Feed.belongsTo(User, { foreignKey: 'userId' });

// User ↔ Article
User.hasMany(Article, { foreignKey: 'userId', onDelete: 'CASCADE' });
Article.belongsTo(User, { foreignKey: 'userId' });

// Category ↔ Feed
Category.hasMany(Feed, { foreignKey: 'categoryId', onDelete: 'CASCADE' });
Feed.belongsTo(Category, { foreignKey: 'categoryId' });

// Feed ↔ Article
Feed.hasMany(Article, { foreignKey: 'feedId', onDelete: 'CASCADE' });
Article.belongsTo(Feed, { foreignKey: 'feedId' });

// Article ↔ Tag
Article.hasMany(Tag, { foreignKey: 'articleId', onDelete: 'CASCADE' });
Tag.belongsTo(Article, { foreignKey: 'articleId' });

// User ↔ SmartFolder
User.hasMany(SmartFolder, { foreignKey: 'userId', onDelete: 'CASCADE' });
SmartFolder.belongsTo(User, { foreignKey: 'userId' });

// Article ↔ ArticleCluster
Article.belongsTo(ArticleCluster, {
  foreignKey: 'clusterId',
  as: 'cluster'
});
ArticleCluster.hasMany(Article, {
  foreignKey: 'clusterId',
  as: 'articles'
});

// Representative article for cluster
ArticleCluster.belongsTo(Article, {
  foreignKey: 'representativeArticleId',
  as: 'representative',
  constraints: false
});

// ---- Export db ----
export default {
  sequelize,
  Sequelize,
  User,
  Category,
  Feed,
  Article,
  Tag,
  Action,
  Setting,
  SmartFolder,
  ArticleCluster,
  Hotlink
};