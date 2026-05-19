import db from '../models/index.js';
import { Op } from 'sequelize';

const { Feed, Tag } = db;

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
