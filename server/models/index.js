'use strict';

import Sequelize from 'sequelize';
import { installDatabaseConnectionPolicy } from '../config/databaseRuntime.js';

// ---- Load DB config (CommonJS via .cjs) ----
import dbConfig from '../config/config.cjs';

const env = process.env.NODE_ENV || 'development';
const config = dbConfig[env];

if (!config) {
  throw new Error(`No database configuration found for environment: ${env}`);
}

// ---- Sequelize init (SINGLE instance) ----
const sequelize = config.dialect === 'sqlite'
  ? new Sequelize({
    dialect: config.dialect,
    storage: config.storage,
    pool: { max: 1, min: 0, idle: 10_000 },
    logging: config.logging ?? false
  })
  : new Sequelize(
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

installDatabaseConnectionPolicy(sequelize);

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
import IslandModel from './island.js';
import IslandTopicModel from './islandTopic.js';
import IslandTaxonomyModel from './islandTaxonomy.js';
import HotlinkModel from './hotlink.js';
import OfficialSourceModel from './officialSource.js';
import CrawlRunModel from './crawlRun.js';
import FeedCrawlResultModel from './feedCrawlResult.js';
import ProcessingFailureModel from './processingFailure.js';
import BriefingPreferenceModel from './briefingPreference.js';
import FeedUrlAliasModel from './feedUrlAlias.js';
import PushSubscriptionModel from './pushSubscription.js';

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
const Island = IslandModel(sequelize);
const IslandTopic = IslandTopicModel(sequelize);
const IslandTaxonomy = IslandTaxonomyModel(sequelize);
const Hotlink = HotlinkModel(sequelize);
const OfficialSource = OfficialSourceModel(sequelize);
const CrawlRun = CrawlRunModel(sequelize);
const FeedCrawlResult = FeedCrawlResultModel(sequelize);
const ProcessingFailure = ProcessingFailureModel(sequelize);
const BriefingPreference = BriefingPreferenceModel(sequelize);
const FeedUrlAlias = FeedUrlAliasModel(sequelize);
const PushSubscription = PushSubscriptionModel(sequelize);

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

// User ↔ Feed URL Alias
User.hasMany(FeedUrlAlias, {
  foreignKey: 'userId',
  as: 'feedUrlAliases',
  onDelete: 'CASCADE'
});
FeedUrlAlias.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(PushSubscription, {
  foreignKey: 'userId',
  as: 'pushSubscriptions',
  onDelete: 'CASCADE'
});
PushSubscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// User ↔ Article
User.hasMany(Article, { foreignKey: 'userId', onDelete: 'CASCADE' });
Article.belongsTo(User, { foreignKey: 'userId' });

// User ↔ OfficialSource
User.hasMany(OfficialSource, { foreignKey: 'userId', onDelete: 'CASCADE' });
OfficialSource.belongsTo(User, { foreignKey: 'userId' });

// User ↔ CrawlRun
User.hasMany(CrawlRun, { foreignKey: 'userId', onDelete: 'CASCADE' });
CrawlRun.belongsTo(User, { foreignKey: 'userId' });

// CrawlRun/Feed/User ↔ FeedCrawlResult
CrawlRun.hasMany(FeedCrawlResult, { foreignKey: 'crawlRunId', as: 'feedResults', onDelete: 'CASCADE' });
FeedCrawlResult.belongsTo(CrawlRun, { foreignKey: 'crawlRunId', as: 'crawlRun' });
User.hasMany(FeedCrawlResult, { foreignKey: 'userId', as: 'feedCrawlResults', onDelete: 'CASCADE' });
FeedCrawlResult.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Feed.hasMany(FeedCrawlResult, { foreignKey: 'feedId', as: 'crawlResults', onDelete: 'CASCADE' });
FeedCrawlResult.belongsTo(Feed, { foreignKey: 'feedId', as: 'feed' });

// CrawlRun/User ↔ ProcessingFailure
CrawlRun.hasMany(ProcessingFailure, {
  foreignKey: 'crawlRunId',
  as: 'processingFailures',
  onDelete: 'CASCADE'
});
ProcessingFailure.belongsTo(CrawlRun, { foreignKey: 'crawlRunId', as: 'crawlRun' });
User.hasMany(ProcessingFailure, {
  foreignKey: 'userId',
  as: 'processingFailures',
  onDelete: 'CASCADE'
});
ProcessingFailure.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// User ↔ BriefingPreference
User.hasOne(BriefingPreference, {
  foreignKey: 'userId',
  as: 'briefingPreference',
  onDelete: 'CASCADE'
});
BriefingPreference.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Category ↔ Feed
Category.hasMany(Feed, { foreignKey: 'categoryId', onDelete: 'CASCADE' });
Feed.belongsTo(Category, { foreignKey: 'categoryId' });

// Feed ↔ Feed URL Alias
Feed.hasMany(FeedUrlAlias, {
  foreignKey: 'feedId',
  as: 'urlAliases',
  onDelete: 'CASCADE'
});
FeedUrlAlias.belongsTo(Feed, { foreignKey: 'feedId', as: 'feed' });

// Feed ↔ Article
Feed.hasMany(Article, { foreignKey: 'feedId', onDelete: 'CASCADE' });
Article.belongsTo(Feed, { foreignKey: 'feedId' });

// Article ↔ Hotlink
Article.hasMany(Hotlink, {
  foreignKey: 'sourceArticleId',
  as: 'outboundHotlinks',
  onDelete: 'CASCADE'
});
Hotlink.belongsTo(Article, {
  foreignKey: 'sourceArticleId',
  as: 'sourceArticle'
});

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

// User ↔ Island
User.hasMany(Island, { foreignKey: 'userId', onDelete: 'CASCADE' });
Island.belongsTo(User, { foreignKey: 'userId' });

// ---- Semantic Grouping ----
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
Event.belongsTo(Article, {
  as: 'representativeArticle',
  foreignKey: 'representativeArticleId',
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE'
});
Event.belongsTo(Article, {
  as: 'developingArticle',
  foreignKey: 'developingArticleId',
  onUpdate: 'CASCADE',
  onDelete: 'SET NULL'
});

// Article duplicate traceability
Article.belongsTo(Article, { foreignKey: 'duplicateOfArticleId', as: 'canonicalArticle' });
Article.hasMany(Article, { foreignKey: 'duplicateOfArticleId', as: 'duplicateArticles' });

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

// Island ↔ Topic (many-to-many semantic interest assignments)
Island.belongsToMany(Topic, {
  through: IslandTopic,
  foreignKey: 'islandId',
  otherKey: 'topicId',
  as: 'topics'
});
Topic.belongsToMany(Island, {
  through: IslandTopic,
  foreignKey: 'topicId',
  otherKey: 'islandId',
  as: 'islands'
});

IslandTopic.belongsTo(Island, { foreignKey: 'islandId' });
Island.hasMany(IslandTopic, { foreignKey: 'islandId', onDelete: 'CASCADE' });
IslandTopic.belongsTo(Topic, { foreignKey: 'topicId' });
Topic.hasMany(IslandTopic, { foreignKey: 'topicId', onDelete: 'CASCADE' });

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
  Island,
  IslandTopic,
  IslandTaxonomy,
  Hotlink,
  OfficialSource,
  CrawlRun,
  FeedCrawlResult,
  ProcessingFailure,
  BriefingPreference,
  FeedUrlAlias,
  PushSubscription
};
