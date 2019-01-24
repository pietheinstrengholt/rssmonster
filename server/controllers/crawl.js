const Sequelize = require("sequelize");
const Op = Sequelize.Op;

const Feed = require("../models/feed");
const Article = require("../models/article");

const autodiscover = require("../util/autodiscover");
const parseFeed = require("../util/parser");

exports.getCrawl = async (req, res, next) => {
  try {
    const feeds = await Feed.findAll();

    if (feeds.length > 0) {
      feeds.forEach(async function (feed) {
        const url = await autodiscover.discover(feed.rssUrl);
        const feeditem = await parseFeed.process(url);
        console.log(feeditem);
      });
    }
  } catch (err) {
    console.log(err);
  }
};
