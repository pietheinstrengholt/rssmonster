const Sequelize = require("sequelize");
const Op = Sequelize.Op;

const Feed = require("../models/feed");
const Article = require("../models/article");

const autodiscover = require("../util/autodiscover");
const parseFeed = require("../util/parser");
const language = require("../util/language");
const cheerio = require("cheerio");

var striptags = require("striptags");

exports.getCrawl = async (req, res, next) => {
  try {
    const feeds = await Feed.findAll({
      where: {
        active: true
      }
    });

    if (feeds.length > 0) {
      feeds.forEach(async function(feed) {
        //discover rssUrl
        const url = await autodiscover.discover(feed.url);

        //do not process undefined URLs
        if(typeof url !== "undefined") {
          try {
            const feeditem = await parseFeed.process(url);
            if (feeditem) {
              //process all feed posts
              feeditem.posts.forEach(function(post) {
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
            });
          }
        }
      });
    }

    return res.status(200).json("Crawling started.");
  } catch (err) {
    console.log(url);
    console.log(err);
  }
};

async function processArticle(feed, post) {
  try {
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

    if (!article) {

      try {
        //remove any script tags
        const $ = cheerio.load(post.description);

        //dismiss undefined errors
        if (typeof $ !== 'undefined') {
          $('script').remove();

          //add article
          Article.create({
            feedId: feed.id,
            status: "unread",
            star_ind: 0,
            url: post.link,
            image_url: "",
            subject: post.title || 'No title',
            content: $.html(),
            contentStripped: striptags($.html(), ["a", "img", "strong"]),
            language: language.get($.html()),
            //contentSnippet: item.contentSnippet,
            //author: item.author,
            //default post.pubdate with new Date when empty
            published: post.pubdate || new Date()
          });
        }
      } catch (error) {
        console.log(error) // handle error
      }
    }
  } catch (err) {
    console.log(err);
  }
}
