var FeedParser = require("feedparser");
var request = require("request"); // for fetching the feed

const Feed = require("../models/feed");
const Article = require("../models/article");
const cheerio = require("cheerio");
const fetch = require("node-fetch");

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

function doRequest(url) {
  return new Promise(function(resolve, reject) {
    request(url, function(error, res, body) {
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
  var url = req.body.url;
  console.log(url);
  const categoryId = req.body.categoryId;

  try {
    //set variables
    var req = request(url);
    var feedparser = new FeedParser();

    try {
      const response = await fetch(url);
      const body = await response.text();
      if (body) {
        const $ = cheerio.load(body);
        if ($("head").find('link[type="application/rss+xml"]').length == 1) {
          autoDiscoverUrl = $('head link[type="application/rss+xml"]').attr(
            "href"
          );
          console.log(autoDiscoverUrl);
        }
      }
      //console.log(body);
    } catch (error) {
      console.log(error);
    }

    //validate if the url is responding, if not return an error
    req.on("error", function(error) {
      return res.status(400).json({
        error_msg: error
      });
    });

    req.on("response", function(res) {
      var stream = this; // `this` is `req`, which is a stream

      var body = "";
      var autoDiscoverUrl = "";
      console.log(autoDiscoverUrl);
      res.on("data", function(chunk) {
        body += chunk;
      });
      res.on("end", function() {
        const $ = cheerio.load(body);
        console.log(
          "length: " + $("head").find('link[type="application/rss+xml"]').length
        );
        autoDiscoverUrl = $('head link[type="application/rss+xml"]').attr(
          "href"
        );
        console.log(autoDiscoverUrl);
        if ($("head").find('link[type="application/rss+xml"]').length == 1) {
          //autoDiscoverUrl = $('head link[type="application/rss+xml"]').attr("href");
          url = autoDiscoverUrl;
          console.log(autoDiscoverUrl);
          var discoverRequest = request(autoDiscoverUrl);

          discoverRequest.on("response", function(res) {
            var discoverStream = this; // `this` is `req`, which is a stream

            if (res.statusCode !== 200) {
              this.emit("error", new Error("Bad status code"));
            } else {
              console.log("stream the auto discover url");
              discoverStream.pipe(feedparser);
            }
          });
        }
      });
      console.log(
        "show value after trying to get auto discover: " + autoDiscoverUrl
      );
      if (autoDiscoverUrl == "") {
        console.log("stream the original url");
        stream.pipe(feedparser);
      }
    });

    feedparser.on("error", function(error) {
      return res.status(404).json({
        error: error
      });
    });

    feedparser.on("readable", function(req) {
      //get the metadata
      var meta = this.meta;
      console.log(meta);

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
            error_msg: "Feed already exists."
          });
        }
      });
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      error_msg: "" + err
    });
  }
};
