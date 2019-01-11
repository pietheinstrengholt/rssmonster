const Feed = require("../models/feed");
const Article = require("../models/article");

const cheerio = require("cheerio");
const fetch = require("node-fetch");
const feedparser = require("feedparser-promised");

exports.getFeeds = async (req, res, next) => {
  try {
    const feeds = await Feed.findAll();
    return res.status(200).json({
      feeds: feeds
    });
  } catch (err) {
    //return server if something goes wrong
    console.log(err);
    return res.status(500).json(err);
  }
};

exports.getFeed = async (req, res, next) => {
  const feedId = req.params.feedId;
  try {
    const feed = await Feed.findByPk(feedId);
    return res.status(200).json({
      feed: feed
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

exports.updateFeed = async (req, res, next) => {
  const feedId = req.params.feedId;
  const feed_name = req.body.feed_name;
  const feed_desc = req.body.feed_desc;
  const categoryId = req.body.categoryId;
  const url = req.body.url;
  const favicon = req.body.favicon;
  try {
    const feed = await Feed.findByPk(feedId);
    if (!feed) {
      return res.status(404).json({
        message: "Feed not found"
      });
    }
    if (feed) {
      feed.update({
        feed_name: req.body.feed_name,
        feed_desc: req.body.feed_desc,
        categoryId: req.body.categoryId,
        url: req.body.url,
        favicon: req.body.favicon
      });
      return res.status(200).json(feed);
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

exports.deleteFeed = async (req, res, next) => {
  const feedId = req.params.feedId;
  try {
    feed = await Feed.findByPk(feedId);
    if (!feed) {
      return res.status(400).json({
        message: "Feed not found"
      });
    }
    if (feed) {
      //delete all articles
      Article.destroy({
        where: {
          feedId: feed.id
        }
      });
      //delete feed
      feed.destroy();
      return res.status(204).json({
        message: "Deleted successfully"
      });
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

exports.addFeed = async (req, res, next) => {
  //capture body url
  var url = req.body.url;
  const categoryId = req.body.categoryId;

  try {
    const response = await fetch(url);
    const body = await response.text();
    if (body) {
      const $ = cheerio.load(body);
      if ($("head").find('link[type="application/rss+xml"]').length == 1) {
        autoDiscoverUrl = $('head link[type="application/rss+xml"]').attr(
          "href"
        );
        url = autoDiscoverUrl;
      }
    }

    //parse feed
    feedparser
      .parse(url)
      .then(result => {
        Feed.findOne({
          where: {
            url: url
          }
        }).then(feed => {
          if (!feed) {
            Feed.create({
              categoryId: categoryId,
              feed_name: result[0].meta.title,
              feed_desc: result[0].meta.description,
              url: url,
              favicon: result[0].meta.image.url
            })
              .then(result => {
                return res.status(200).json(result);
              })
              .catch(err => {
                console.log(err);
                return res.status(500).json({
                  error_msg: "" + err
                });
              });
          } else {
            return res.status(500).json({
              error_msg: "Feed already exists."
            });
          }
        });
      })
      .catch(err => {
        console.log(err);
        return res.status(500).json({
          error_msg: "" + err
        });
      });
  } catch (err) {
    return res.status(500).json({
      error_msg: "" + err
    });
  }
};
