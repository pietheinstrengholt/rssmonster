import Hotlink from '../models/hotlink.js';
import NodeCache from 'node-cache';
import Sequelize from 'sequelize';

const Op = Sequelize.Op;

// stdTTL: time to live in seconds for every generated cache element.
const cache = new NodeCache({ stdTTL: 14 * 24 * 60 * 60 })

export const set = (url) => {
  //set cache
  cache.set(url)

  //store in database
  Hotlink.create({
    url: url
  });
}

export const get = (url) => {
  //returns boolean indicating if the key is cached
  return cache.has(url)
}

export const all = () => {
  //returns an array of all existing keys
  return cache.keys()
}

export const init = async () => {
  //destroy records older than two weeks
  Hotlink.destroy({
    where: {
      createdAt: {
        [Op.lte] : (new Date() -  14 * 24 * 60 * 60 * 1000)
      }
    }
  });

  //selecting all hotlinks is a performance challenge, so therefore we first collect all hotlinks
  var hotlinks = await Hotlink.findAll({
    attributes: ["url"],
    raw : true
  });

  //next we push all ids to an array
  if (hotlinks.length > 0) {
    hotlinks.forEach(hotlink => {
      cache.set(hotlink.url);
    });
  }
}

export default {
  set,
  get,
  all,
  init
}