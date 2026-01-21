import db from '../models/index.js';
import { Op } from 'sequelize';
const { Hotlink } = db;

export const clearCache = async () => {

  // cleanup old records more than 14 days old
  await Hotlink.destroy({
    where: {
      createdAt: {
        [Op.lte]: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      }
    }
  });
};

export const set = async (url, userId) => {
  await Hotlink.create({ url, userId });
};

export const get = (url) => Hotlink.findOne({ where: { url } });

export const all = () => Hotlink.findAll();

export default {
  clearCache,
  set,
  get,
  all
};