'use strict';

import Sequelize from 'sequelize';

// Import DB config
import dbConfig from '../config/config.js';

// Import models (CLASS-BASED)
import User from './user.js';
import Category from './category.js';
import Feed from './feed.js';
import Article from './article.js';
import Tag from './tag.js';
import Action from './action.js';

// Import other models
import { Setting } from './setting.js';
import { SmartFolder } from './smartFolder.js';
import { ArticleCluster } from './articleCluster.js';
import { Hotlink } from './hotlink.js';

const env = process.env.NODE_ENV || 'development';
const config = dbConfig[env];

if (!config) {
  throw new Error(`No database configuration found for environment: ${env}`);
}

// --------------------
// Sequelize init
// --------------------
const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    dialect: config.dialect,
    logging: false
  }
);

// --------------------
// Register models with Sequelize
// --------------------
const models = {
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

// Attach sequelize to each model (REQUIRED for class models)
Object.values(models).forEach(model => {
  if (!model.sequelize) {
    model.init(model.rawAttributes, {
      sequelize,
      modelName: model.name
    });
  }
});

// --------------------
// Associations
// --------------------

// Associations: User 1..* Action
Action.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Action, { foreignKey: 'userId' });

// Article -> Cluster
Article.belongsTo(ArticleCluster, {
  foreignKey: 'clusterId',
  as: 'cluster'
});

// Cluster -> Articles
ArticleCluster.hasMany(Article, {
  foreignKey: 'clusterId',
  as: 'articles'
});

// Representative article
ArticleCluster.belongsTo(Article, {
  foreignKey: 'representativeArticleId',
  as: 'representative'
});

//add associations
Category.hasMany(Feed);
Feed.belongsTo(Category);

// associations
Feed.hasMany(Article, { foreignKey: 'feedId' });
Article.belongsTo(Feed, { foreignKey: 'feedId' });

// Associations
SmartFolder.belongsTo(User, {
  foreignKey: 'userId',
  onDelete: 'CASCADE'
});

// Associations: Article 1..* Tag (direct foreign key)
Tag.belongsTo(Article, { foreignKey: 'articleId' });
Article.hasMany(Tag, { foreignKey: 'articleId' });

//add associations
User.hasMany(Category);
User.hasMany(Feed);
User.hasMany(Article);

// --------------------
// Export db
// --------------------
export default {
  sequelize,
  Sequelize,
  ...models
};
