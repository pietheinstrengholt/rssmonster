import db from '../models/index.js';
import { Op } from 'sequelize';
const { Hotlink } = db;

export const clearCache = async () => {
  try {
    // cleanup old records more than 14 days old
    await Hotlink.destroy({
      where: {
        createdAt: {
          [Op.lte]: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
        }
      }
    });
  } catch (err) {
    // Some legacy databases may miss hotlinks.createdAt; skip cleanup instead of crashing.
    if (
      err?.name === 'SequelizeDatabaseError' &&
      String(err?.message || '').includes("Unknown column 'createdAt'")
    ) {
      console.warn('Skipping hotlink cleanup: hotlinks.createdAt column is missing.');
      return;
    }

    throw err;
  }
};

export const set = async (url, feedId, userId) => {
  await Hotlink.create({ url, feedId, userId });
};

export const get = (url, feedId, userId) => Hotlink.findOne({ where: { url, feedId, userId } });

export const all = () => Hotlink.findAll();

export default {
  clearCache,
  set,
  get,
  all
};