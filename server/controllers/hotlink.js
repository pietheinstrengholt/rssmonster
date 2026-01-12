import db from '../models/index.js';
const { Hotlink } = db;

export const clearCache = async () => {

  // cleanup old records
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

export const get = (url) => {
  return Hotlink.findOne({ where: { url } });
};

export const all = () => Hotlink.findAll();

export default {
  clearCache,
  set,
  get,
  all
};