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
import ArticleTopicModel from './articleTopic.js';
import EventTopicModel from './eventTopic.js';
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
const ArticleTopic = ArticleTopicModel(sequelize);
const EventTopic = EventTopicModel(sequelize);
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
//   Article <-> Topic via article_topics (ranked, confidence-scored, primary flag)
//   Event   <-> Topic via event_topics   (ranked, confidence-scored, primary flag)
//
// Denormalized primary topic links (Article.topicId / Event.topicId) are retained as
// read-side optimizations while many-to-many joins remain the source of truth.

// Topic ↔ Event (denormalized primary link)
Topic.hasMany(Event, { foreignKey: 'topicId', as: 'primaryEvents', onDelete: 'SET NULL' });
Event.belongsTo(Topic, { foreignKey: 'topicId', as: 'primaryTopic' });

// Event ↔ Article
Event.hasMany(Article, { foreignKey: 'eventId', onDelete: 'SET NULL', as: 'articles' });
Article.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });
Article.belongsTo(Event, { foreignKey: 'eventId', as: 'cluster' });

// Topic ↔ Article (denormalized primary link)
Topic.hasMany(Article, { foreignKey: 'topicId', as: 'primaryArticles', onDelete: 'SET NULL' });
Article.belongsTo(Topic, { foreignKey: 'topicId', as: 'topic' });

// Article ↔ Topic (many-to-many semantic assignments)
Article.belongsToMany(Topic, {
  through: ArticleTopic,
  foreignKey: 'articleId',
  otherKey: 'topicId',
  as: 'topics'
});
Topic.belongsToMany(Article, {
  through: ArticleTopic,
  foreignKey: 'topicId',
  otherKey: 'articleId',
  as: 'articles'
});

ArticleTopic.belongsTo(Article, { foreignKey: 'articleId' });
Article.hasMany(ArticleTopic, { foreignKey: 'articleId', onDelete: 'CASCADE' });
ArticleTopic.belongsTo(Topic, { foreignKey: 'topicId' });
Topic.hasMany(ArticleTopic, { foreignKey: 'topicId', onDelete: 'CASCADE' });

// Event ↔ Topic (many-to-many semantic assignments)
Event.belongsToMany(Topic, {
  through: EventTopic,
  foreignKey: 'eventId',
  otherKey: 'topicId',
  as: 'topics'
});
Topic.belongsToMany(Event, {
  through: EventTopic,
  foreignKey: 'topicId',
  otherKey: 'eventId',
  as: 'events'
});

EventTopic.belongsTo(Event, { foreignKey: 'eventId' });
Event.hasMany(EventTopic, { foreignKey: 'eventId', onDelete: 'CASCADE' });
EventTopic.belongsTo(Topic, { foreignKey: 'topicId' });
Topic.hasMany(EventTopic, { foreignKey: 'topicId', onDelete: 'CASCADE' });

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
  ArticleTopic,
  EventTopic,
  Hotlink
};