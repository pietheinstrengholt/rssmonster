import { Op } from 'sequelize';
import Feed from "../models/feed.js";
import Article from "../models/article.js";
import Tag from "../models/tag.js";
import Action from "../models/action.js";

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
        },
        // DEBUG: Filter for specific URL - remove this line after debugging
        //url: 'http://blog.feedbin.com/'
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

// Timeout wrapper for feed processing (default 60 seconds)
const FEED_TIMEOUT_MS = parseInt(process.env.FEED_TIMEOUT_MS) || 60000;

const withTimeout = (promise, timeoutMs, feedUrl) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Feed processing timed out after ${timeoutMs / 1000} seconds`)), timeoutMs)
    )
  ]);
};

// Core crawl function that processes feeds synchronously
const performCrawl = async () => {
  const feeds = await getFeeds();
  let processedCount = 0;
  let errorCount = 0;
  let timeoutCount = 0;

  if (feeds.length > 0) {
    // Use Promise.all with map to wait for all feeds to be processed
    await Promise.all(feeds.map(async (feed) => {
      try {
        // Wrap entire feed processing in a timeout
        await withTimeout((async () => {
          //discover RssLink - first try feed.url, then fallback to rssUrl if available
          let url = await discoverRssLink.discoverRssLink(feed.url);
          console.log(`Crawling feed: ${feed.url} (Discovered RSS: ${url})`);
          
          // If discovery failed and we have a stored rssUrl, try that instead
          if (typeof url === "undefined" && feed.rssUrl) {
            console.log(`Discovery failed for ${feed.url}, trying stored rssUrl: ${feed.rssUrl}`);
            url = await discoverRssLink.discoverRssLink(feed.rssUrl);
          }

          //do not process undefined URLs
          if (typeof url !== "undefined") {
            try {
              const feeditem = await parseFeed.process(url);
              if (feeditem) {

                //process all feed posts - use Promise.all to wait for all articles
                await Promise.all(feeditem.items.map((item) => processArticle(feed, item)));
    
                //reset the feed count, clear error message, and update the favicon if available
                const faviconUrl = feeditem.image?.url || null;
                await feed.update({
                  favicon: faviconUrl,
                  rssUrl: url,
                  errorCount: 0,
                  errorMessage: null
                });
                processedCount++;
                console.log(`Successfully processed feed: ${feed.url} with ${feeditem.items.length} items.`);
              } else {
                // feeditem is null/undefined - treat as error
                const errMsg = 'No valid feed data returned';
                console.error('Error processing feed:', errMsg, '-', feed.url);
                await feed.update({
                  errorCount: feed.errorCount + 1,
                  errorMessage: errMsg
                });
                errorCount++;
              }
            } catch (err) {
              const errMsg = err.message || 'Unknown error';
              console.error('Error processing feed:', err.stack?.split("\n", 1).join("") || errMsg, '-', feed.url);
              //update the errorCount and errorMessage
              await feed.update({
                errorCount: feed.errorCount + 1,
                errorMessage: errMsg
              });
              errorCount++;
            }
          } else {
            const errMsg = 'No RSS link discovered';
            console.log(`${errMsg} for feed: ${feed.url}`);
            //update the errorCount and errorMessage
            await feed.update({
              errorCount: feed.errorCount + 1,
              errorMessage: errMsg
            });
            errorCount++;
          }

          //touch updatedAt
          feed.changed('updatedAt', true);
          await feed.update({
            updatedAt: new Date()
          });
        })(), FEED_TIMEOUT_MS, feed.url);
      } catch (err) {
        if (err.message.includes('timed out')) {
          console.error(`Timeout processing feed: ${feed.url} - skipping to next feed`);
          timeoutCount++;
          // Update error count and message for timeout
          await feed.update({
            errorCount: feed.errorCount + 1,
            errorMessage: err.message,
            updatedAt: new Date()
          });
        } else {
          console.error('Error processing feed:', feed.url, err);
        }
        errorCount++;
      }
    }));
  }

  return { 
    total: feeds.length, 
    processed: processedCount, 
    errors: errorCount,
    timeouts: timeoutCount
  };
};

const crawlRssLinks = catchAsync(async (req, res, next) => {
  try {
    // For HTTP requests, start crawling asynchronously and return immediately
    performCrawl().then(result => {
      console.log(`Crawl completed: ${result.processed} feeds processed, ${result.errors} errors, ${result.timeouts} timeouts`);
    }).catch(err => {
      console.error('Error during async crawl:', err);
    });

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
              {title: post.title},
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
          // Check if there's media content (e.g., YouTube videos)
          if (post.media && Array.isArray(post.media) && post.media.length > 0) {
            const media = post.media[0];
            // Build content from media information
            postContent = `
              <div class="media-content">
                ${media.image ? `<img src="${media.image}" alt="${media.title || 'Media'}" style="max-width: 100%; height: auto;">` : ''}
                ${media.title ? `<h5>${media.title}</h5>` : ''}
                ${media.url ? `<p><a href="${media.url}" target="_blank">View Media</a></p>` : ''}
              </div>
            `;
            postContentStripped = media.title || post.description || post.title || '';
            try {
              postLanguage = language.get(postContentStripped);
            } catch (langErr) {
              console.error(`[${feed.feedName}] Error detecting language for article "${post.title}":`, langErr.message);
              postLanguage = 'unknown';
            }
          } else {
            // Fallback to description
            postContent = post.description;
            postContentStripped = post.description;
            try {
              postLanguage = language.get(post.description);
            } catch (langErr) {
              console.error(`[${feed.feedName}] Error detecting language for article "${post.title}":`, langErr.message);
              postLanguage = 'unknown';
            }
          }
        } else {
          //content is set, so we might expect html rich content. Because of this we want to remove any script tags
          //htmlparser2 has error-correcting mechanisms, which may be useful when parsing non-HTML content.
          try {
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
                  if (!post.url) {
                    console.warn(`[${feed.feedName}] Article "${post.title}" has no URL property`);
                    return; // Skip this link if post.url is missing
                  }
                  const urlObj = new URL(post.url);
                  domain = urlObj.hostname;
                } catch (err) {
                  console.error(`[${feed.feedName}] Error parsing URL "${post.url}":`, err.message);
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
              try {
                postLanguage = language.get($.html());
              } catch (langErr) {
                console.error(`[${feed.feedName}] Error detecting language for article "${post.title}":`, langErr.message);
                postLanguage = 'unknown';
              }
            }
          } catch (parseErr) {
            console.error(`[${feed.feedName}] Error parsing content for article "${post.title}":`, parseErr.message);
            postContent = post.description || post.title || '';
            postContentStripped = post.description || post.title || '';
            postLanguage = 'unknown';
          }
        }
        
        //add article to database, if content or a description has been found
        if (postContent) {
          // Retrieve actions for applying rules to the article
          // Do this BEFORE OpenAI analysis to avoid wasting API calls on deleted articles
          const actions = await Action.findAll({
            where: { userId: feed.userId }
          });

          // Apply each action to the article
          // Actions allow users to automatically modify article properties based on regex patterns
          let starInd = 0;
          let shouldDelete = false;
          let statusToSet = 'unread';
          let clickedInd = 0;
          let actionAdvertisementScore = null;
          let actionQualityScore = null;
          if (actions && actions.length > 0) {
            for (const action of actions) {
              // Check delete actions first - they take precedence over all other actions
              // If a delete action matches, the article won't be created at all
              if (action.actionType === 'delete' && action.regularExpression) {
                try {
                  const regex = new RegExp(action.regularExpression);
                  if (regex.test(postContentStripped)) {
                    shouldDelete = true;
                    console.log(`Delete action "${action.name}" matched article "${post.title}". Skipping article creation.`);
                    break; // Stop processing once we find a matching delete action
                  }
                } catch (regexErr) {
                  console.error(`Error testing regex for action "${action.name}":`, regexErr.message);
                }
              } 
              // Read action: marks article as read instead of unread
              else if (action.actionType === 'read' && action.regularExpression) {
                try {
                  const regex = new RegExp(action.regularExpression);
                  if (regex.test(postContentStripped)) {
                    statusToSet = 'read';
                    console.log(`Read action "${action.name}" matched article "${post.title}". Setting status to read.`);
                  }
                } catch (regexErr) {
                  console.error(`Error testing regex for action "${action.name}":`, regexErr.message);
                }
              } 
              // Advertisement action: marks article as advertisement (high ad score)
              else if (action.actionType === 'advertisement' && action.regularExpression) {
                try {
                  const regex = new RegExp(action.regularExpression);
                  if (regex.test(postContentStripped)) {
                    actionAdvertisementScore = 100;
                    console.log(`Advertisement action "${action.name}" matched article "${post.title}". Setting advertisementScore to 100.`);
                  }
                } catch (regexErr) {
                  console.error(`Error testing regex for action "${action.name}":`, regexErr.message);
                }
              } 
              // Bad quality action: marks article as low quality
              else if (action.actionType === 'badquality' && action.regularExpression) {
                try {
                  const regex = new RegExp(action.regularExpression);
                  if (regex.test(postContentStripped)) {
                    actionQualityScore = 100;
                    console.log(`Bad quality action "${action.name}" matched article "${post.title}". Setting qualityScore to 100.`);
                  }
                } catch (regexErr) {
                  console.error(`Error testing regex for action "${action.name}":`, regexErr.message);
                }
              } 
              // Star action: marks article as starred/important
              else if (action.actionType === 'star' && action.regularExpression) {
                try {
                  // Test the regex against the article content (stripped version)
                  const regex = new RegExp(action.regularExpression);
                  if (regex.test(postContentStripped)) {
                    starInd = 1;
                    console.log(`Action "${action.name}" matched article "${post.title}". Setting starInd to 1.`);
                  }
                } catch (regexErr) {
                  console.error(`Error testing regex for action "${action.name}":`, regexErr.message);
                }
              }
              // Clicked action: marks article as clicked/read-later indicator
              else if (action.actionType === 'clicked' && action.regularExpression) {
                try {
                  const regex = new RegExp(action.regularExpression);
                  if (regex.test(postContentStripped)) {
                    clickedInd = 1;
                    console.log(`Clicked action "${action.name}" matched article "${post.title}". Setting clickedInd to 1.`);
                  }
                } catch (regexErr) {
                  console.error(`Error testing regex for action "${action.name}":`, regexErr.message);
                }
              }
            }
          }

          // Skip article creation if delete action matched
          if (shouldDelete) {
            return;
          }

          // Analyze content once (summary + tags + scores)
          // Done AFTER delete check to avoid wasting API calls
          let analysis = {
            summary: postContentStripped,
            tags: [],
            advertisementScore: 0,
            sentimentScore: 50,
            qualityScore: 50,
          };

          // Only analyze content if OpenAI API key and model are configured
          if (process.env.OPENAI_API_KEY && (process.env.OPENAI_MODEL_CRAWL || process.env.OPENAI_MODEL_NAME)) {
            try {
              // Analyze content using OpenAI API
              analysis = await analyzeContent(postContentStripped);
              console.log(`[OpenAI LLM] Analysis completed for "${post.title || 'No title'}"`);
            } catch (err) {
              console.error('Error analyzing content:', err.message);
            }
          }

          // Apply action overrides after analysis
          if (actionAdvertisementScore !== null) {
            analysis.advertisementScore = actionAdvertisementScore;
          }
          if (actionQualityScore !== null) {
            analysis.qualityScore = actionQualityScore;
          }

          // Create article with analysis results
          const createdArticle = await Article.create({
            userId: feed.userId,
            feedId: feed.id,
            status: statusToSet,
            starInd: starInd,
            clickedInd: clickedInd,
            url: post.url,
            image_url: "",
            title: post.title || 'No title',
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
  processArticle,
  performCrawl
}