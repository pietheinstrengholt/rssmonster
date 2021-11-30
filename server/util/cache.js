const Hotlink = require("../models/hotlink");

const NodeCache = require('node-cache');

const Sequelize = require("sequelize");
const Op = Sequelize.Op;

// stdTTL: time to live in seconds for every generated cache element.
const cache = new NodeCache({ stdTTL: 14 * 24 * 60 * 60 })

function set(url) {
  //set cache
  cache.set(url)

  //store in database
  Hotlink.create({
    url: url
  });
}

function get(url) {
  //returns boolean indicating if the key is cached
  return cache.has(url)
}

function all() {
  //returns an array of all existing keys
  return cache.keys()
}

async function init() {
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

module.exports = { get, set, all, init }
