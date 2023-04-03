import FeedParser from "feedparser";
import got from "got";
import he from "he";

export const process = async (feedUrl) => {
  const stream = await ReadFeed(feedUrl)
  const posts = await ReadFeedStream(stream, feedUrl)
  const response = await ParseFeedPost(posts)
  return response
}

async function ReadFeed (url) {
  try {
    const response = await got.stream(url, { retries: 0 })
    return response
  } catch(err) {
    console.log(err);
  }
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

export default {
  process
}