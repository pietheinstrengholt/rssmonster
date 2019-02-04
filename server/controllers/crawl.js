const Sequelize = require("sequelize");
const Op = Sequelize.Op;

const Feed = require("../models/feed");
const Article = require("../models/article");

const autodiscover = require("../util/autodiscover");
const parseFeed = require("../util/parser");
const language = require("../util/language");

var striptags = require('striptags');

exports.getCrawl = async (req, res, next) => {
  try {
    const feeds = await Feed.findAll();

    if (feeds.length > 0) {
      feeds.forEach(async function (feed) {
        //discover rssUrl
        const url = await autodiscover.discover(feed.url);
        try {
          const feeditem = await parseFeed.process(url);
          if (feeditem) {
            //process all feed posts
            feeditem.posts.forEach(function (post) {
              processArticle(feed, post);
            });

            //reset the feed count
            feed.update({
              errorCount: 0
            });
          }
        } catch (err) {
          console.log(err.stack.split("\n", 1).join(""));
          //update the errorCount
          feed.update({
            errorCount: Sequelize.literal("errorCount + 1")
          })
        }
      });
    }
    return res.status(200).json("Crawling started.");
  } catch (err) {
    console.log(err);
  }
};

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
        contentStripped: striptags(post.description, ['a', 'img', 'strong']),
        language: language.get(post.description),
        //contentSnippet: item.contentSnippet,
        //author: item.author,
        published: post.pubdate
      });
    }
  } catch (err) {
    console.log(err);
  }
}