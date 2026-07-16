import { Op } from 'sequelize';

import hotlink from '../../../controllers/hotlink.js';
import db from '../../../models/index.js';

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
export const persistAcceptedHotlinks = async (urls, feed, hotlinkBatcher) => {
  if (!urls.length) return;

  try {
    if (hotlinkBatcher) {
      hotlinkBatcher.add(urls);
      return;
    }

    await hotlink.setMany(urls, feed.id, feed.userId);
  } catch (err) {
    console.error(`Error saving hotlinks for accepted article in feed ${feed.id}:`, err);
  }
};
