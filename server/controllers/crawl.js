import { Op } from 'sequelize';
import Feed from "../models/feed.js";
import Article from "../models/article.js";
import Tag from "../models/tag.js";

import discoverRssLink from "../util/discoverRssLink.js";
import parseFeed from "../util/parser.js";
import language from "../util/language.js";
import { analyzeContent } from "../util/analyzer.js";
import { load } from 'cheerio';
import * as htmlparser2 from "htmlparser2";
import cache from '../util/cache.js';
import striptags from "striptags";

//set the maximum number of feeds to be processed at once
const feedCount = parseInt(process.env.MAX_FEEDCOUNT) || 10;

//put the try/catch block into a higher function and then put the async/await functions of that function
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

//this function crawls all feeds for all users
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
  } catch (err) {
    console.error('Error fetching feeds from database:', err.message);
    return [];
  }
}

const crawlRssLinks = catchAsync(async (req, res, next) => {
  try {
    const feeds = await getFeeds();

    if (feeds.length > 0) {
      feeds.forEach(async (feed) => {

        //discover RssLink
        const url = await discoverRssLink.discoverRssLink(feed.url);

        //do not process undefined URLs
        if (typeof url !== "undefined") {
          console.log("Collecting new articles for feed: " + url);
          try {
            const feeditem = await parseFeed.process(url);
            if (feeditem) {

              //process all feed posts
              feeditem.items.forEach((item) => {
                processArticle(feed, item);
              });
  
              //reset the feed count and update the favicon if available
              await feed.update({
                favicon: feeditem.image.url,
                errorCount: 0
              });
            }
          } catch (err) {
            console.error('Error processing feed:', err.stack.split("\n", 1).join(""), '-', feed.url);
            //update the errorCount
            await feed.increment('errorCount');
          }
        } else {
          //update the errorCount
          await feed.increment('errorCount');
        }

        //touch updatedAt
        feed.changed('updatedAt', true);
        await feed.update({
          updatedAt: new Date()
        });

      });
    }

    return res.status(200).json({ message: 'Crawling started.' });
  } catch (err) {
    console.error('Error in crawlRssLinks:', err);
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
              {feedId: feed.id},
              {userId: feed.userId}
            ]}
          ]
        }
      });
  
      //if none, add new article to the database
      if (!article) {
        let postContent, postContentStripped, postLanguage;
        
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
              let domain;
              try {
                //find domain name for each link
                const urlObj = new URL(post.url);
                domain = urlObj.hostname;
              } catch (err) {
                console.error('Error parsing URL:', err);
                domain = post.url;
              }
    
              //fetch all urls referenced to other websites. Insert these into the hotlinks table
              const href = $(this).attr('href');
              if (href) {
                if (!href.includes(domain)) {
                  //only add http and https urls to database
                  if (href.startsWith("http://") || href.startsWith("https://")) {
                    //update cache
                    cache.set(href, feed.userId);
                  }
                }
              }
            });

            //set postContent and postContentStripped
            postContent = $.html();
            postContentStripped = striptags($.html(), ["a", "img", "strong"]);
            postLanguage = language.get($.html());
          } 
        }
        
        //add article to database, if content or a description has been found
        if (postContent) {
          // Analyze content once (summary + tags + scores)
          let analysis = {
            summary: postContentStripped,
            tags: [],
            advertisementScore: 0,
            sentimentScore: 50,
            qualityScore: 50,
          };

          if (process.env.OPENAI_API_KEY && (process.env.OPENAI_MODEL_CRAWL || process.env.OPENAI_MODEL_NAME)) {
            try {
              analysis = await analyzeContent(postContentStripped);
              console.log(`Analysis for "${post.title || 'No title'}":`);
              console.log(`  Summary: ${analysis.summary.substring(0, 120)}...`);
              console.log(`  Tags: ${analysis.tags.join(', ')}`);
              console.log(`  Ad: ${analysis.advertisementScore}, Sentiment: ${analysis.sentimentScore}, Quality: ${analysis.qualityScore}`);
            } catch (err) {
              console.error('Error analyzing content:', err.message);
            }
          }

          // Create article with analysis results
          const createdArticle = await Article.create({
            userId: feed.userId,
            feedId: feed.id,
            status: "unread",
            star_ind: 0,
            url: post.url,
            image_url: "",
            subject: post.title || 'No title',
            content: postContent,
            contentStripped: analysis.summary,
            language: postLanguage,
            advertisementScore: analysis.advertisementScore,
            sentimentScore: analysis.sentimentScore,
            qualityScore: analysis.qualityScore,
            published: post.published || new Date()
          });

          // Save tags to database if any were generated
          if (analysis.tags.length > 0) {
            const tagPromises = analysis.tags.map(tagName => 
              Tag.create({
                articleId: createdArticle.id,
                userId: feed.userId,
                name: tagName
              }).catch(err => {
                console.error(`Error saving tag "${tagName}":`, err.message);
              })
            );
            await Promise.all(tagPromises);
            console.log(`Saved ${analysis.tags.length} tags for article ${createdArticle.id}`);
          }
        }
      }
    } catch (err) {
      console.error('Error processing article:', err);
    }
  }
};

export default {
  crawlRssLinks,
  processArticle
}