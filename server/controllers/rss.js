import db from '../models/index.js';
const { Article, Feed, Category, GeneratedFeed } = db;
import { canonicalArticleWhere } from '../services/duplicates/articleDuplicates.js';
import { executeGeneratedFeedExpression } from '../services/generatedFeeds/generatedFeedExecution.js';
import { buildRssXml } from '../services/rss/rssRenderer.js';

const GENERATED_FEED_NOT_FOUND = { message: 'Generated Feed not found' };
const GENERATED_FEED_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,64}$/;

const requestBaseUrl = req => `${req.protocol}://${req.get('host')}`;

const loadRssArticles = async ({ userId, itemIds }) => {
  if (!itemIds.length) return [];

  const articles = await Article.findAll({
    where: {
      id: itemIds,
      userId,
      ...canonicalArticleWhere()
    },
    include: [Feed]
  });
  const articlesById = new Map(articles.map(article => [String(article.id), article]));

  return itemIds
    .map(id => articlesById.get(String(id)))
    .filter(Boolean);
};

// GET /rss?feedId=456&limit=50&starred=true&unread=true
// Generates an RSS feed from stored articles
const generateRss = async (req, res, next) => {
  try {
    const { feedId, categoryId, limit = 50, starred, unread } = req.query;
    const userId = req.userData?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication is required' });
    }

    const minLimit = 1;
    const maxLimit = 200;
    const parsedLimit = Number.parseInt(limit, 10);
    const queryLimit = Number.isFinite(parsedLimit)
      ? Math.max(minLimit, Math.min(parsedLimit, maxLimit))
      : 50;

    const where = { userId, ...canonicalArticleWhere() };
    if (feedId) {
      where.feedId = feedId;
    }
    if (starred === 'true') {
      where.favoriteInd = 1;
    }
    if (unread === 'true') {
      where.status = 'unread';
    }

    const feedInclude = {
      model: Feed,
      include: [Category]
    };

    if (categoryId) {
      feedInclude.where = { categoryId };
      feedInclude.required = true; // enforce category filter
    }

    const articles = await Article.findAll({
      where,
      include: [feedInclude],
      order: [
        ['publishedAt', 'DESC'],
        ['createdAt', 'DESC']
      ],
      limit: queryLimit
    });

    const baseUrl = requestBaseUrl(req);
    const selfLink = `${baseUrl}${req.originalUrl}`;
    const rssXml = buildRssXml(articles, {
      title: 'RSSMonster generated feed',
      link: baseUrl,
      selfLink,
      description: 'RSS feed generated from stored articles',
      language: 'en'
    });

    res.set('Content-Location', selfLink);
    res.set('Content-Type', 'application/rss+xml');
    return res.send(rssXml);
  } catch (err) {
    console.error('Error generating RSS feed:', err);
    return next(err);
  }
};

// GET /rss/generated/:token
// Resolves an opaque bearer token and dynamically renders its stored article expression.
const generatePublicGeneratedFeed = async (req, res, next) => {
  try {
    if (!GENERATED_FEED_TOKEN_PATTERN.test(req.params.token)) {
      return res.status(404).json(GENERATED_FEED_NOT_FOUND);
    }

    const generatedFeed = await GeneratedFeed.findOne({
      where: { token: req.params.token, enabled: true },
      attributes: ['name', 'description', 'expression', 'userId']
    });
    if (!generatedFeed) return res.status(404).json(GENERATED_FEED_NOT_FOUND);

    const result = await executeGeneratedFeedExpression({
      userId: generatedFeed.userId,
      expression: generatedFeed.expression
    });
    const articles = await loadRssArticles({
      userId: generatedFeed.userId,
      itemIds: result.itemIds
    });
    const feedUrl = `${requestBaseUrl(req)}${req.originalUrl.split('?')[0]}`;
    const rssXml = buildRssXml(articles, {
      title: `RSSMonster - ${generatedFeed.name}`,
      link: feedUrl,
      selfLink: feedUrl,
      description: generatedFeed.description
        || `Generated RSSMonster feed: ${generatedFeed.name}`,
      language: 'en'
    });

    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Location': feedUrl,
      'Content-Type': 'application/rss+xml'
    });
    return res.send(rssXml);
  } catch (err) {
    console.error('Error generating public Generated Feed:', {
      name: err?.name || 'Error',
      code: err?.original?.code || err?.code || null
    });
    return next(err);
  }
};

export default {
  generatePublicGeneratedFeed,
  generateRss
};
