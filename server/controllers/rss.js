import { Builder } from 'xml2js';
import Article from '../models/article.js';
import Feed from '../models/feed.js';
import Category from '../models/category.js';

// Build an RSS 2.0 XML document from a list of articles
const buildRssXml = (articles, meta) => {
  const builder = new Builder({ cdata: true });

  const items = articles.map(article => ({
    title: article.title || 'No title',
    link: article.url,
    guid: article.id,
    pubDate: new Date(article.published || article.createdAt || Date.now()).toUTCString(),
    description: article.contentStripped || article.content || '',
    category: article.Feed?.title ? [article.Feed.title] : undefined
  }));

  const rssObject = {
    rss: {
      $: { version: '2.0' },
      channel: [
        {
          title: meta.title,
          link: meta.link,
          description: meta.description,
          language: meta.language,
          lastBuildDate: new Date().toUTCString(),
          item: items
        }
      ]
    }
  };

  return builder.buildObject(rssObject);
};

// GET /rss?userId=123&feedId=456&limit=50&starred=true&unread=true
// Generates an RSS feed from stored articles
const generateRss = async (req, res, next) => {
  try {
    const { userId, feedId, categoryId, limit = 50, starred, unread } = req.query;

    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    const maxLimit = 200;
    const parsedLimit = Number.parseInt(limit, 10);
    const queryLimit = Number.isFinite(parsedLimit) ? Math.min(parsedLimit, maxLimit) : 50;

    const where = { userId };
    if (feedId) {
      where.feedId = feedId;
    }
    if (starred === 'true') {
      where.starInd = 1;
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
        ['published', 'DESC'],
        ['createdAt', 'DESC']
      ],
      limit: queryLimit
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const rssXml = buildRssXml(articles, {
      title: 'RSSMonster generated feed',
      link: baseUrl,
      description: 'RSS feed generated from stored articles',
      language: 'en'
    });

    res.set('Content-Type', 'application/rss+xml');
    return res.send(rssXml);
  } catch (err) {
    console.error('Error generating RSS feed:', err);
    return next(err);
  }
};

export default {
  generateRss
};
