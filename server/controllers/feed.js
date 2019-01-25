const Feed = require("../models/feed");
const Article = require("../models/article");

const autodiscover = require("../util/autodiscover");
const parseFeed = require("../util/parser");

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
  const feedName = req.body.feedName;
  const feedDesc = req.body.feedDesc;
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
        feedName: req.body.feedName,
        feedDesc: req.body.feedDesc,
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

exports.newFeed = async (req, res, next) => {
  const feedName = req.body.feedName;
  const feedDesc = req.body.feedDesc;
  const categoryId = req.body.categoryId;
  const url = req.body.url;
  const rssUrl = req.body.rssUrl;
  const favicon = req.body.favicon;
  try {
    const feed = await Feed.create({
      categoryId: categoryId,
      feedName: feedName,
      feedDesc: feedDesc,
      url: url,
      rssUrl: rssUrl
    });
    return res.status(200).json(feed);
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

exports.validateFeed = async (req, res, next) => {
  //resolve url
  const origUrl = req.body.url;
  const url = await autodiscover.discover(req.body.url);
  const categoryId = req.body.categoryId;

  try {

    const feeditem = await parseFeed.process(url);
    if (feeditem) {

      //add feed
      Feed.findOne({
        where: {
          url: feeditem.meta.xmlurl
        }
      }).then(feed => {
        if (!feed) {
          return res.status(200).json({
            categoryId: categoryId,
            feedName: feeditem.meta.title,
            feedDesc: feeditem.meta.description,
            url: req.body.url,
            rssUrl: feeditem.meta.xmlurl,
            favicon: feeditem.meta.favicon
          });
        } else {
          return res.status(402).json({
            error_msg: "Feed already exists."
          });
        }
      });

    } else {
      return res.status(500).json({
        error_msg: "Feed has no meta attributes"
      });
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      error_msg: "" + err
    });
  }
};