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
import TopicModel from './topic.js';
import EventModel from './event.js';
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
const Topic = TopicModel(sequelize);
const Event = EventModel(sequelize);
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

// User ↔ Topic
User.hasMany(Topic, { foreignKey: 'userId', onDelete: 'CASCADE' });
Topic.belongsTo(User, { foreignKey: 'userId' });

// User ↔ Event
User.hasMany(Event, { foreignKey: 'userId', onDelete: 'CASCADE' });
Event.belongsTo(User, { foreignKey: 'userId' });

// ---- Semantic Clustering & Topic Grouping ----
// 
// Relationship structure:
//   Article -> Event -> Topic (structural: primary grouping)
//   Article -> Topic       (denormalized: for efficient querying)
//
// Assignment logic (services/events/assignArticleToEvent.js):
//   1. Article vectors matched against Event vectors (>88% similarity)
//   2. If match found: article assigned to existing event (reuses event.topicId)
//   3. If no match: article resolves topic (by topic vector, >65% similarity or create)
//   4. New event created with resolved/created topic
//   5. Both article.topicId and event.topicId set to same topic for consistency
//
// Performance notes:
//   - Article.topicId is denormalized for fast topic-level queries
//   - Event.topicId is the structural grouping; deleting event does not cascade topic
//   - Thresholds (0.88 event, 0.65 topic) configured in semanticConfig.js

// Topic ↔ Event
Topic.hasMany(Event, { foreignKey: 'topicId', onDelete: 'SET NULL' });
Event.belongsTo(Topic, { foreignKey: 'topicId' });

// Event ↔ Article
Event.hasMany(Article, { foreignKey: 'eventId', onDelete: 'SET NULL', as: 'articles' });
Article.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });
Article.belongsTo(Event, { foreignKey: 'eventId', as: 'cluster' });

// Topic ↔ Article (denormalized for direct access)
Topic.hasMany(Article, { foreignKey: 'topicId', onDelete: 'SET NULL' });
Article.belongsTo(Topic, { foreignKey: 'topicId', as: 'topic' });

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
  Topic,
  Event,
  Hotlink
};