import Sequelize from 'sequelize';
import Feed from "../models/feed.js";
import Article from "../models/article.js";

import discoverRssLink from "../util/discoverRssLink.js";
import parseFeed from "../util/parser.js";
import language from "../util/language.js";
import { load } from 'cheerio';
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

const getFeeds = async () => {
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
    return feeds;
  } catch (e) {
    console.log(
      "Error fetching feeds from database " + e.message
    );
  }
}

const crawlRssLinks = catchAsync(async (req, res, next) => {
  try {
    let feeds = await getFeeds();

    if (feeds.length > 0) {
      feeds.forEach(async function(feed) {

        //discover RssLink
        const url = await discoverRssLink.discoverRssLink(feed.url);

        //do not process undefined URLs
        if (typeof url !== "undefined") {
          console.log("Collecting new articles for feed: " + url);
          try {
            const feeditem = await parseFeed.process(url);
            if (feeditem) {

              //process all feed posts
              feeditem.items.forEach(function(item) {
                processArticle(feed, item);
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
  if (post.url) {
    try {
      //try to find any existing article with the same link or same feedId and postTitle
      const article = await Article.findOne({
        where: {
          [Op.or]: [
            {url: post.url},
            {[Op.and] : [
              {subject: post.title},
              {feedId: feed.id}
            ]}
          ]
        }
      });
  
      //if none, add new article to the database
      if (!article) {
        //if no content is found, use the description as content
        if (typeof post.content === 'undefined' || post.content === null) {
          postContent = post.description;
          postContentStripped = post.description;
          postLanguage = language.get(post.description);
        } else {
          //content is set, so we might expect html rich content. Because of this we want to remove any script tags
          //htmlparser2 has error-correcting mechanisms, which may be useful when parsing non-HTML content.
          const dom = htmlparser2.parseDocument(post.content);
          const $ = load(dom, { _useHtmlParser2: true });
    
          //dismiss undefined errors
          if (typeof $ !== 'undefined') {
            //remove all script tags from post content
            $('script').remove();
    
            //execute hotlink feature by collecting all the links in each RSS post
            //https://github.com/passiomatic/coldsweat/issues/68#issuecomment-272963268
            $('a').each(function() {
              try {
                //find domain name for each link
                var domain = (new URL(post.url));
                domain = domain.hostname;
              } catch (err) {
                console.log(err);
                var domain = post.url;
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

            //set postContent and postContentStripped
            var postContent = $.html();
            var postContentStripped = striptags($.html(), ["a", "img", "strong"]);
            var postLanguage = language.get($.html());
          } 
        }
        
        //add article to database, if content or a description has been found
        if (postContent) {
          Article.create({
            feedId: feed.id,
            status: "unread",
            star_ind: 0,
            url: post.url,
            image_url: "",
            subject: post.title || 'No title',
            content: postContent,
            contentStripped: postContentStripped,
            language: postLanguage,
            //default post.published with new Date when empty
            published: post.published || new Date()
          });
        }


      }
    } catch (err) {
      console.log(err);
    }
  }
};

export default {
  crawlRssLinks,
  processArticle
}