const Feed = require("../models/feed");
const Article = require("../models/article");

const feedparser = require("feedparser-promised");
const autodiscover = require("../util/autodiscover");

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
  const rssUrl = req.body.rssUrl;
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
        rssUrl: req.body.rssUrl,
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
  try {
    //capture body url and autodiscover the rss feed
    const url = await autodiscover.discover(req.body.url);
    const categoryId = req.body.categoryId;

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
            console.log(result[0].meta);
            Feed.create({
              categoryId: categoryId,
              feed_name: result[0].meta.title,
              feed_desc: result[0].meta.description,
              url: result[0].meta.link,
              rssUrl: url,
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
