var FeedParser = require("feedparser");
var request = require("request"); // for fetching the feed

const Feed = require("../models/feed");
const Article = require("../models/article");
const cheerio = require('cheerio');

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
      feed
        .update({
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

function doRequest(url) {
  return new Promise(function (resolve, reject) {
    request(url, function (error, res, body) {
      if (!error && res.statusCode == 200) {
        resolve(body);
      } else {
        reject(error);
      }
    });
  });
}

exports.addFeed = async (req, res, next) => {
  //capture body url
  const url = req.body.url;

  let result1 = await doRequest(url);

  const $ = cheerio.load(result1);
  var RssFeed = $('head link[type="application/rss+xml"]').attr("href");
  console.log(RssFeed);

  //console.log(result1);

  const categoryId = req.body.categoryId;

  try {

    //set variables
    var req = request(url);
    var feedparser = new FeedParser();
    var validateOrig = true;

    //validate if the url is responding, if not return an error
    req.on("error", function (error) {
      return res.status(400).json({
        error_msg: error
      });
    });

    req.on("response", function (res) {
      var stream = this; // `this` is `req`, which is a stream

      var body = '';
      res.on('data', function(chunk) {
        body += chunk;
      });
      res.on('end', function() {
        const $ = cheerio.load(body);
        var RssFeed = $('head link[type="application/rss+xml"]').attr("href");
        console.log(RssFeed);
        if (RssFeed) {
          var req2 = request(RssFeed);
        }

        req2.on("response", function (res) {
          var stream = this; // `this` is `req`, which is a stream
    
          if (res.statusCode !== 200) {
            this.emit("error", new Error("Bad status code"));
          } else {
            stream.pipe(feedparser);
            validateOrig = false;
          }
        });

      });

      if (res.statusCode !== 200 && validateOrig == true) {
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
            error_msg: 'Feed already exists.'
          });
        }
      });
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      error_msg: '' + err
    });
  }
};