// Contains small data-access helpers used by the article search pipeline.
// These helpers isolate tag and feed id lookups from the search service orchestration.
import db from '../../models/index.js';
import { Op } from 'sequelize';

const { Feed, Tag } = db;

// Finds article ids for a user's exact tag name.
export const fetchTaggedArticleIds = async ({ userId, tagName }) => {
  if (!tagName) {
    return null;
  }

  const tagRows = await Tag.findAll({
    where: { userId, name: tagName },
    attributes: ['articleId']
  });

  return tagRows.map(row => row.articleId);
};

// Resolves the feed ids that should be included for a feed or category filter.
export const fetchFeedIds = async ({ userId, categoryId, feedId }) => {
  if (feedId !== '%') {
    return feedId;
  }

  if (categoryId === '%') {
    const feeds = await Feed.findAll({
      attributes: ['id'],
      where: { userId }
    });
    return feeds.map(feed => feed.id);
  }

  const feeds = await Feed.findAll({
    attributes: ['id'],
    where: {
      userId,
      categoryId: { [Op.like]: categoryId }
    }
  });

  return feeds.map(feed => feed.id);
};
