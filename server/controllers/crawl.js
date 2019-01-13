const Sequelize = require("sequelize");
const Op = Sequelize.Op;

const Feed = require("../models/feed");
const Article = require("../models/article");

const feedparser = require("feedparser-promised");
const autodiscover = require("../util/autodiscover");

exports.getCrawl = async (req, res, next) => {
  try {
    const feeds = await Feed.findAll();

    if (feeds.length > 0) {
      feeds.forEach(function(feed) {
        //do not crawl feeds with an error count which is too high
        if (feed.errorCount < 10) {
          fetch(feed);
        }
      });
    }
    return res.status(200).json("Crawling background process started.");
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

async function fetch(feed) {
  const url = await autodiscover.discover(feed.url);
  feedparser
    .parse(url)
    .then(items => items.forEach(item => processArticle(feed, item)))
    .catch(console.error);
}

async function processArticle(feed, post) {
  try {
    //try to find an article with the same content, post title or url in the database
    const article = await Article.findOne({
      where: {
        [Op.or]: [
          {
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

    //skip if an article with the same content is found
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
