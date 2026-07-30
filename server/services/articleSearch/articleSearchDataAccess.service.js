// Contains small data-access helpers used by the article search pipeline.
// These helpers isolate tag and feed id lookups from the search service orchestration.
import db from '../../models/index.js';
import { Op } from 'sequelize';

// Provides the shared dependencies used by this service.
const { Feed, Tag } = db;

// Finds article ids for a user's exact tag name.
export const fetchTaggedArticleIds = async ({ userId, tagName }) => {
  // Returns no result when tag name is unavailable.
  if (!tagName) {
    return null;
  }

  // Loads the tag rows needed while performing fetch tagged article id.
  const tagRows = await Tag.findAll({
    where: { userId, name: tagName },
    attributes: ['articleId']
  });

  // Maps source values into the result produced while performing fetch tagged article id.
  return tagRows.map(row => row.articleId);
};

// Resolves the feed ids that should be included for a feed or category filter.
export const fetchFeedIds = async ({ userId, categoryId, feedId }) => {
  // Returns early when feed id is not %.
  if (feedId !== '%') {
    return feedId;
  }

  // Handles the case where category id is %.
  if (categoryId === '%') {
    // Loads the feeds needed while performing fetch feed id.
    const feeds = await Feed.findAll({
      attributes: ['id'],
      where: { userId }
    });
    // Maps source values into the result produced while performing fetch feed id.
    return feeds.map(feed => feed.id);
  }

  // Loads the feeds needed while performing fetch feed id.
  const feeds = await Feed.findAll({
    attributes: ['id'],
    where: {
      userId,
      categoryId: { [Op.like]: categoryId }
    }
  });

  // Maps source values into the result produced while performing fetch feed id.
  return feeds.map(feed => feed.id);
};
