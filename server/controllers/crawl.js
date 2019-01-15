const Sequelize = require("sequelize");
const Op = Sequelize.Op;

const Feed = require("../models/feed");
const Article = require("../models/article");

var FeedParser = require("feedparser");
var request = require("request"); // for fetching the feed
var zlib = require('zlib');
var Iconv = require('iconv').Iconv;

const autodiscover = require("../util/autodiscover");

exports.getCrawl = async (req, res, next) => {
  try {
    const feeds = await Feed.findAll();

    if (feeds.length > 0) {
      feeds.forEach(function (feed) {
        fetch(feed);
      });
    }
    return res.status(200).json("Crawling background process started.");
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

async function fetch(feed) {
  // Define our streams
  const url = await autodiscover.discover(feed.url);
  var req = request(url, {
    timeout: 10000,
    pool: false
  });
  req.setMaxListeners(50);
  // Some feeds do not respond without user-agent and accept headers.
  req.setHeader(
    "user-agent",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.63 Safari/537.36"
  );
  req.setHeader("accept", "text/html,application/xhtml+xml");

  var feedparser = new FeedParser();

  // Define our handlers
  req.on("error", (done) => feed.update({
    errorCount: Sequelize.literal('errorCount + 1')
  }));
  req.on("response", function (res) {
    if (res.statusCode != 200)
      return this.emit("error", new Error("Bad status code"));
    var encoding = res.headers["content-encoding"] || "identity",
      charset = getParams(res.headers["content-type"] || "").charset;
    res = maybeDecompress(res, encoding);
    res = maybeTranslate(res, charset);
    res.pipe(feedparser);
  });

  feedparser.on("error", (done) => feed.update({
    errorCount: Sequelize.literal('errorCount + 1')
  }));
  feedparser.on("readable", function () {
    var post;
    while ((post = this.read())) {
      //process article
      processArticle(feed, post);
    }
  });
}

function done(err) {
  if (err) {
    console.log(err, err.stack);
  }
}

function getParams(str) {
  var params = str.split(";").reduce(function (params, param) {
    var parts = param.split("=").map(function (part) {
      return part.trim();
    });
    if (parts.length === 2) {
      params[parts[0]] = parts[1];
    }
    return params;
  }, {});
  return params;
}

function maybeDecompress(res, encoding) {
  var decompress;
  if (encoding.match(/\bdeflate\b/)) {
    decompress = zlib.createInflate();
  } else if (encoding.match(/\bgzip\b/)) {
    decompress = zlib.createGunzip();
  }
  return decompress ? res.pipe(decompress) : res;
}

function maybeTranslate(res, charset) {
  var iconv;
  // Use iconv if its not utf8 already.
  if (!iconv && charset && !/utf-*8/i.test(charset)) {
    try {
      iconv = new Iconv(charset, "utf-8");
      console.log("Converting from charset %s to utf-8", charset);
      iconv.on("error", done);
      // If we're using iconv, stream will be the output of iconv
      // otherwise it will remain the output of request
      res = res.pipe(iconv);
    } catch (err) {
      res.emit("error", err);
    }
  }
  return res;
}

async function processArticle(feed, post) {
  try {
    const article = await Article.findOne({
      where: {
        [Op.or]: [{
            url: post.link
          },
          {
            subject: post.title
          }
        ],
        [Op.and]: {
          feedId: feed.id
        }
      }
    });

    if (!article) {
      //add article
      Article.create({
        feedId: feed.id,
        status: "unread",
        star_ind: 0,
        url: post.link,
        image_url: "",
        subject: post.title,
        content: post.description,
        //contentSnippet: item.contentSnippet,
        //author: item.author,
        published: post.pubdate
      });
    }
  } catch (err) {
    console.log(err);
  }
}