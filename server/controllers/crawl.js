import Sequelize from 'sequelize';
import Feed from "../models/feed.js";
import Article from "../models/article.js";

import autodiscover from "../util/autodiscover.js";
import parseFeed from "../util/parser.js";
import language from "../util/language.js";
import cheerio from "cheerio";
import * as htmlparser2 from "htmlparser2";
import cache from '../util/cache.js';
import striptags from "striptags";

const Op = Sequelize.Op;

//set the maximum number of feeds to be processed at once
const feedCount = parseInt(process.env.MAX_FEEDCOUNT) || 10;

//put the try/catch block into a higher function and then put the async/await functions of that function
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

const getCrawl = catchAsync(async (req, res, next) => {
  try {
    //only get feeds with an errorCount lower than 25
    const feeds = await Feed.findAll({
      where: {
        active: true,
        errorCount: {
          [Op.lt]: 25
        }
      },
      order: [
        ['updatedAt', 'ASC']
      ],
      limit: feedCount
    });

    if (feeds.length > 0) {
      feeds.forEach(async function(feed) {

        //discover rssUrl
        const url = await autodiscover.discover(feed.url);

        console.log("Collecting new articles for feed: " + url);

        //do not process undefined URLs
        if (typeof url !== "undefined") {
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
            console.log(err.stack.split("\n", 1).join("") + " - " + feed.url);
            //update the errorCount
            feed.update({
              errorCount: Sequelize.literal("errorCount + 1")
            });
          }
        } else {
          //update the errorCount
          feed.update({
            errorCount: Sequelize.literal("errorCount + 1")
          });
        }

        //touch updatedAt
        feed.changed('updatedAt', true);
        feed.update({
          updatedAt: new Date()
        });

      });
    }

    return res.status(200).json("Crawling started.");
  } catch (err) {
    return next(err);
  }
});

const processArticle = async (feed, post) => {

  //don't process empty post URLs
  if (post.link) {
    try {
      //try to find any existing article with the same link and post title
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
  
      //if none, add new article to the database
      if (!article) {
        //remove any script tags
        //dismiss "cheerio.load() expects a string" by converting to string
  
        //htmlparser2 has error-correcting mechanisms, which may be useful when parsing non-HTML content.
        const dom = htmlparser2.parseDocument(post.description);
        const $ = cheerio.load(dom, { _useHtmlParser2: true });
  
        //dismiss undefined errors
        if (typeof $ !== 'undefined') {
          $('script').remove();
  
          //execute hotlink feature by collecting all the links in each RSS post
          //https://github.com/passiomatic/coldsweat/issues/68#issuecomment-272963268
          $('a').each(function() {
            try {
              //find domain name for each link
              var domain = (new URL(post.link));
              domain = domain.hostname;
            } catch (err) {
              console.log(err);
              var domain = post.link;
            }
  
            //fetch all urls referenced to other websites. Insert these into the hotlinks table
            if ($(this).attr('href')) {
              if (!$(this).attr('href').includes(domain)) {
                //only add http and https urls to database
                if ($(this).attr('href').indexOf("http://") == 0 || $(this).attr('href').indexOf("https://") == 0) {
                  //update cache
                  cache.set($(this).attr('href'));
                }
              }
            }
          });
  
          //parse media RSS feeds: https://www.rssboard.org/media-rss
          if (post?.['media:group']?.['media:content']?.['@']?.['url'] !== undefined) {
            var postLink = post['media:group']['media:content']['@']['url'];
            var postTitle = post['media:group']['media:title']['#'];
            var postContent = post['media:group']['media:description']['#'];
            var postContentStripped = striptags(post['media:group']['media:description']['#']);
            var postLanguage = language.get(post['media:group']['media:description']['#']);
          } else {
            var postLink = post.link;
            var postTitle = post.title;
            var postContent = $.html();
            var postContentStripped = striptags($.html(), ["a", "img", "strong"]);
            var postLanguage = language.get($.html());
          }
  
          //add article
          Article.create({
            feedId: feed.id,
            status: "unread",
            star_ind: 0,
            url: postLink,
            image_url: "",
            subject: postTitle || 'No title',
            content: postContent,
            contentStripped: postContentStripped,
            language: postLanguage,
            //contentSnippet: item.contentSnippet,
            //author: item.author,
            //default post.pubdate with new Date when empty
            published: post.pubdate || new Date()
          });
        }
      }
    } catch (err) {
      console.log(err);
    }
  }
};

export default {
  getCrawl,
  processArticle
}