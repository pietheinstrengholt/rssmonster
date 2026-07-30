import { Op } from 'sequelize';

import hotlink from '../../../controllers/hotlink.js';
import db from '../../../models/index.js';

// Provides the shared dependencies used by this service.
const { Hotlink } = db;

// This function returns how many other-feed articles link to one normalized article URL.
export const countArticleHotlinks = async (feed, normalizedUrl, hotlinkCountCache) =>
  hotlinkCountCache
    ? hotlinkCountCache.count(normalizedUrl, feed.id)
    : Hotlink.count({
        where: {
          userId: feed.userId,
          feedId: { [Op.ne]: feed.id },
          [Op.or]: [
            { url: normalizedUrl },
            { url: { [Op.like]: `${normalizedUrl}?%` } }
          ]
        }
      });

// This function persists collected hotlinks only after their source article is accepted.
export const persistAcceptedHotlinks = async (
  urls,
  feed,
  sourceArticleId,
  hotlinkBatcher
) => {
  // Returns early when source article id is unavailable.
  if (!sourceArticleId) return;

  try {
    // Handles the case where hotlink batcher is available.
    if (hotlinkBatcher) {
      hotlinkBatcher.add(urls, sourceArticleId);
      return;
    }

    await hotlink.setMany(urls, feed.id, feed.userId, sourceArticleId);
  } catch (err) {
    console.error(`Error saving hotlinks for accepted article in feed ${feed.id}:`, err);
  }
};
