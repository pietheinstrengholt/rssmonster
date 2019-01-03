var FeedParser = require("feedparser");
var request = require("request"); // for fetching the feed

const Feed = require("../models/feed");

exports.getFeeds = (req, res, next) => {
  Feed.findAll()
    .then(feeds => {
      console.log(feeds);
      res.status(200).json({
        feeds: feeds
      });
    })
    .catch(err => {
      console.log(err);
      return res.status(500).json(err);
    });
};

exports.getFeed = (req, res, next) => {
  const feedId = req.params.feedId;
  Feed.findByPk(feedId)
    .then(feed => {
      console.log(feed);
      res.status(200).json({
        feed: feed
      });
    })
    .catch(err => {
      console.log(err);
      return res.status(500).json(err);
    });
};

exports.updateFeed = (req, res, next) => {
  const feedId = req.params.feedId;
  const feed_name = req.body.feed_name;
  const feed_desc = req.body.feed_desc;
  const categoryId = req.body.categoryId;
  const url = req.body.url;
  const favicon = req.body.favicon;
  Feed.findByPk(feedId)
    .then(feed => {
      if (!feed) {
        return res.status(404).json({
          message: "Feed not found"
        });
      }
      return feed
        .update({
          feed_name: req.body.feed_name,
          feed_desc: req.body.feed_desc,
          categoryId: req.body.categoryId,
          url: req.body.url,
          favicon: req.body.favicon
        })
        .then(() => res.status(200).json(feed))
        .catch(error => res.status(400).json(error));
    })
    .catch(error => res.status(400).json(error));
};

exports.deleteFeed = (req, res, next) => {
  const feedId = req.params.feedId;
  Feed.findByPk(feedId)
    .then(feed => {
      if (!feed) {
        return res.status(400).json({
          message: "Feed not found"
        });
      }
      return feed
        .destroy()
        .then(() =>
          res.status(204).json({
            message: "Deleted successfully"
          })
        )
        .catch(error => res.status(400).json(error));
    })
    .catch(error => res.status(400).json(error));
};

exports.addFeed = (req, res, next) => {
  //capture body url
  const url = req.body.url;
  const categoryId = req.body.categoryId;

  try {

    //set variables
    var req = request(url);
    var feedparser = new FeedParser();

    //validate if the url is responding, if not return an error
    req.on("error", function (error) {
      return res.status(400).json({
        error: error
      });
    });

    req.on("response", function (res) {
      var stream = this; // `this` is `req`, which is a stream

      if (res.statusCode !== 200) {
        this.emit("error", new Error("Bad status code"));
      } else {
        stream.pipe(feedparser);
      }
    });

    feedparser.on("error", function (error) {
      return res.status(404).json({
        error: error
      });
    });

    feedparser.on("readable", function (req) {
      //get the metadata
      var meta = this.meta;

      Feed.findOne({
        where: {
          url: meta.xmlurl
        }
      }).then(feed => {
        if (!feed) {
          Feed.create({
              categoryId: categoryId,
              feed_name: meta.title,
              feed_desc: meta.description,
              url: meta.xmlurl,
              favicon: meta.image.url
            })
            .then(result => {
              return res.status(200).json(result);
            })
            .catch(err => {
              console.log(err);
              return res.status(500).json(err);
            });
        } else {
          return res.status(402).json({
            msg: 'Feed already exists.'
          });
        }
      });
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      error: 'internal processing error!'
    });
  }
};