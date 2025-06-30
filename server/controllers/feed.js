import Feed from "../models/feed.js";
import Article from "../models/article.js";

import discoverRssLink from "../util/discoverRssLink.js";
import parseFeed from "../util/parser.js";

const getFeeds = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    const feeds = await Feed.findAll({
      where: {
        userId: userId
      }
    });
    return res.status(200).json({
      feeds: feeds
    });
  } catch (err) {
    //return server if something goes wrong
    console.log(err);
    return res.status(500).json(err);
  }
};

const getFeed = async (req, res, next) => {
  const userId = req.userData.userId;
  const feedId = req.params.feedId;
  try {
    const feed = await Feed.findByPk(feedId, {
      where: {
        userId : userId
      }});
    return res.status(200).json({
      feed: feed
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

const updateFeed = async (req, res, next) => {
  const userId = req.userData.userId;
  const feedId = req.params.feedId;
  try {
    const feed = await Feed.findByPk(feedId, {
      where: {
        userId : userId
      }});
    if (!feed) {
      return res.status(404).json({
        message: "Feed not found"
      });
    }
    if (feed) {
      feed.update({
        userId: userId,
        feedName: req.body.feedName,
        feedDesc: req.body.feedDesc,
        categoryId: req.body.categoryId,
        url: req.body.url,
        rssUrl: req.body.rssUrl,
        favicon: req.body.favicon,
        active: req.body.active,
        errorCount: 0
      });
      return res.status(200).json(feed);
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

const newFeed = async (req, res, next) => {
  try {
    const feed = await Feed.create({
      userId: req.userData.userId,
      categoryId: req.body.categoryId,
      feedName: req.body.feedName,
      feedDesc: req.body.feedDesc,
      url: req.body.url,
      rssUrl: req.body.rssUrl,
      favicon: req.body.favicon,
      active: req.body.active
    });
    return res.status(200).json(feed);
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

const deleteFeed = async (req, res, next) => {
  const userId = req.userData.userId;
  const feedId = req.params.feedId;
  try {
    var feed = await Feed.findByPk(feedId, {
      where: {
        userId : userId
      }});
    if (!feed) {
      return res.status(400).json({
        message: "Feed not found"
      });
    } else {
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

const validateFeed = async (req, res, next) => {

  //resolve url
  const url = await discoverRssLink.discoverRssLink(req.body.url);
  const categoryId = req.body.categoryId;
  const userId = req.userData.userId;

  if (typeof url === "undefined") {
    return res.status(500).json({
      error_msg: "Feed url is invalid. Are you sure the RSS feed is correct?"
    });
  } else if (typeof categoryId === "undefined") {
    return res.status(500).json({
      error_msg: "Category is invalid."
    });
  } else {
  try {

    const feeditem = await parseFeed.process(url);
    if (feeditem) {

      //add feed
      Feed.findOne({
        where: {
          userId: userId,
          url: feeditem.self
        }
      }).then(feed => {
        if (!feed) { 
          return res.status(200).json({
            userId, userId,
            categoryId: categoryId,
            feedName: feeditem.title || feeditem.meta.title,
            feedDesc: feeditem.description || feeditem.meta.description,
            url: req.body.url,
            rssUrl: feeditem.self,
            favicon: feeditem.image
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
  }
};

export default {
  getFeeds,
  getFeed,
  updateFeed,
  newFeed,
  deleteFeed,
  validateFeed
}