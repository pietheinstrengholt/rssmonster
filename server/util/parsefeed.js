exports.fetch = fetch;

var FeedParser = require("feedparser");
var request = require("request"); // for fetching the feed
var zlib = require("zlib");
var Iconv = require("iconv").Iconv;
const Sequelize = require("sequelize");

const metaNames = {
  title: true,
  link: true,
  description: true,
  pubDate: true,
  language: true,
  copyright: true,
  generator: true,
  cloud: true,
  image: true,
  categories: true
};

function fetch(feed) {
  console.log(feed.rssUrl);
  // Define our streams
  var req = request(feed.rssUrl, {
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
  req.on("error", done =>
    feed.update({
      errorCount: Sequelize.literal("errorCount + 1")
    })
  );
  req.on("response", function(res) {
    if (res.statusCode != 200)
      return this.emit("error", new Error("Bad status code"));
    var encoding = res.headers["content-encoding"] || "identity",
      charset = getParams(res.headers["content-type"] || "").charset;
    res = maybeDecompress(res, encoding);
    res = maybeTranslate(res, charset);
    res.pipe(feedparser);
  });

  feedparser.on("error", done =>
    feed.update({
      errorCount: Sequelize.literal("errorCount + 1")
    })
  );
  feedparser.on("readable", function() {
    try {
      results = [];
      while ((post = this.read())) {
        results.push(post);
        //process article
        //processArticle(feed, post);
        //console.log(post);
        //results.items.push(post);
        /* if (post !== null) {
              results.items.push(post);
              for (var x in post.meta) {
                if (metaNames[x] !== undefined) {
                  theFeed.head[x] = post.meta[x];
                }
              }
            } */
      }
      console.log(results);
      console.log(results.length);
    } catch (err) {
      console.log("parseFeedString: err.message == " + err.message);
    }
  });
}

function done(err) {
  if (err) {
    console.log(err, err.stack);
  }
}

function getParams(str) {
  var params = str.split(";").reduce(function(params, param) {
    var parts = param.split("=").map(function(part) {
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
