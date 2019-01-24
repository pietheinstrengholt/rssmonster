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
  const response = await got.stream(url, { retries: 0 })
  return response
}

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