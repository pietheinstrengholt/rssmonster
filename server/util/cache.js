import NodeCache from 'node-cache';
import { Op } from 'sequelize';

// stdTTL: time to live in seconds
const cache = new NodeCache({ stdTTL: 14 * 24 * 60 * 60 });

// module-local reference (dependency injection)
let HotlinkModel = null;

/**
 * Initialize cache with injected Hotlink model
 */
export const initCache = async (Hotlink) => {
  HotlinkModel = Hotlink;

  // cleanup old records
  await HotlinkModel.destroy({
    where: {
      createdAt: {
        [Op.lte]: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      }
    }
  });

  const hotlinks = await HotlinkModel.findAll({
    attributes: ['url', 'userId'],
    raw: true
  });

  for (const hotlink of hotlinks) {
    cache.set(hotlink.url, hotlink.userId);
  }
};

export const set = async (url, userId) => {
  cache.set(url, userId);

  if (!HotlinkModel) {
    throw new Error('Cache not initialized: Hotlink model missing');
  }

  await HotlinkModel.create({ url, userId });
};

export const get = (url) => cache.has(url);

export const all = () => cache.keys();

export default {
  initCache,
  set,
  get,
  all
};