import { Op } from 'sequelize';
import Feed from "../models/feed.js";
import Article from "../models/article.js";
import Tag from "../models/tag.js";

import discoverRssLink from "../util/discoverRssLink.js";
import parseFeed from "../util/parser.js";
import language from "../util/language.js";
import { summarizeContent } from "../util/summarizer.js";
import { classifyContent } from "../util/classifier.js";
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
  
              //reset the feed count
              await feed.update({
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
          // Use summarization if OpenAI is configured
          let summarizedContent = postContentStripped;
          if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL_NAME) {
            try {
              summarizedContent = await summarizeContent(postContentStripped);
              console.log(`Summarized article: ${post.title?.substring(0, 50)}...`);
            } catch (err) {
              console.error('Error summarizing article:', err.message);
              // Fall back to original stripped content
              summarizedContent = postContentStripped;
            }
          }

          // Classify content using OpenAI (tags + scores) and save to database
          let createdArticle;
          let classification = {
            tags: [],
            advertisementScore: 0,
            sentimentScore: 50,
            qualityScore: 50
          };

          if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL_NAME) {
            try {
              classification = await classifyContent(postContentStripped || summarizedContent);
              console.log(`Classification for "${post.title || 'No title'}":`);
              console.log(`  Tags: ${classification.tags.join(', ')}`);
              console.log(`  Ad Score: ${classification.advertisementScore}, Sentiment: ${classification.sentimentScore}, Quality: ${classification.qualityScore}`);
            } catch (err) {
              console.error('Error classifying content:', err.message);
            }
          }

          // Create article with classification scores
          createdArticle = await Article.create({
            userId: feed.userId,
            feedId: feed.id,
            status: "unread",
            star_ind: 0,
            url: post.url,
            image_url: "",
            subject: post.title || 'No title',
            content: postContent,
            contentStripped: summarizedContent,
            language: postLanguage,
            advertisementScore: classification.advertisementScore,
            sentimentScore: classification.sentimentScore,
            qualityScore: classification.qualityScore,
            published: post.published || new Date()
          });

          // Save tags to database if any were generated
          if (classification.tags.length > 0) {
            const tagPromises = classification.tags.map(tagName => 
              Tag.create({
                articleId: createdArticle.id,
                userId: feed.userId,
                name: tagName
              }).catch(err => {
                console.error(`Error saving tag "${tagName}":`, err.message);
              })
            );
            await Promise.all(tagPromises);
            console.log(`Saved ${classification.tags.length} tags for article ${createdArticle.id}`);
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