const Sequelize = require("sequelize");
const Op = Sequelize.Op;

const Feed = require("../models/feed");
const Article = require("../models/article");

const autodiscover = require("../util/autodiscover");
const parseFeed = require("../util/parser");
const faviconoclast = require("faviconoclast");

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

    faviconUrl = await new Promise((resolve, reject) => {
      faviconoclast(feed.rssUrl, (err, iconUrl) => {
        if (err) {
          reject(err)
        }
        resolve(iconUrl)
      })
    });

    const feeditem = await parseFeed.process(url);
    console.log(feeditem);
  } catch(err) {
    console.log(err);
  }
}
