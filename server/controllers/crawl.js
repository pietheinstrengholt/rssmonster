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
        fetch(feed);
      });
    }
    //return res.status(200).json("Crawling background process started.");
  } catch (err) {
    console.log(err);
    //return res.status(500).json(err);
  }
};

async function fetch(feed) {
  try {
    const url = await autodiscover.discover(feed.rssUrl);
    const feeditem = await parseFeed.process(url);
    if (feeditem) {
      console.log("feed geprocessed");
      feed.update({
        errorCount: 0
      });
    }
  } catch(err) {
    feed.update({
      errorCount: Sequelize.literal("errorCount + 1")
    });
    //console.log(err);
  }
}
