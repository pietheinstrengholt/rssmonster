const FeedParser = require("feedparser");
const got = require("got");
const he = require("he");
var zlib = require("zlib");
var Iconv = require("iconv").Iconv;
var request = require("request"); // for fetching the feed

exports.process = async function(feedUrl) {
  const stream = await ReadFeed(feedUrl)
  const posts = await ReadFeedStream(stream, feedUrl)
  const response = await ParseFeedPost(posts)
  return response
}

async function ReadFeed (url) {
  try {
    const response = await got.stream(url, { retries: 0 });
    //response.pipe(maybeDecompress);
    //response = maybeDecompress(response, encoding);
    //response = maybeTranslate(response, charset);
    return response
		//=> '<!doctype html> ...'
	} catch (error) {
    console.log("error processing");
		console.log(error.response.body);
		//=> 'Internal server error ...'
	}
}

/* async function ReadFeed (url) {
  try {

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

    // Define our handlers
    req.on("error", done =>
      feed.update({
        errorCount: Sequelize.literal("errorCount + 1")
      })
    );

    req.on("response", function(res) {
      if (res.statusCode != 200) {
        return this.emit("error", new Error("Bad status code"));
      } else {
        var encoding = res.headers["content-encoding"] || "identity",
          charset = getParams(res.headers["content-type"] || "").charset;
        res = maybeDecompress(res, encoding);
        res = maybeTranslate(res, charset);
        return res;
      }
    });
	} catch (error) {
    console.log("error processing");
	}
} */

async function ReadFeedStream (stream, feedUrl) {
  const feed = {
    meta: '',
    posts: []
  }
  return new Promise((resolve, reject) => {
    stream.pipe(new FeedParser())
      .on('error', reject)
      .on('end', () => {
        resolve(feed)
      })
      .on('readable', function () {
        const streamFeed = this
        feed.meta = {
          link: this.meta.link,
          xmlurl: this.meta.xmlurl ? this.meta.xmlurl : feedUrl,
          favicon: this.meta.favicon,
          description: this.meta.description,
          title: this.meta.title
        }
        let item
        while ((item = streamFeed.read())) {
          feed.posts.push(item)
        }
      })
  })
}

function ParseFeedPost (feed) {
  feed.posts.map((item) => {
    item.favourite = false
    item.read = false
    item.offline = false
    if (item.summary) {
      item.summary = he.unescape(item.summary)
    }
    return item
  })
  return feed
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
