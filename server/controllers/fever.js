import Article from "../models/article.js";
import Feed from "../models/feed.js";
import Category from "../models/category.js";
import cache from '../util/cache.js';
import User from "../models/user.js";
import { Op } from 'sequelize';

//use Fever API
//specs: https://github.com/dasmurphy/tinytinyrss-fever-plugin/blob/master/fever-api.md

export const getFever = async (req, res, next) => {
  try {
    const arr = responseBase();

    //return 200 with arr
    res.status(200).json(arr);

  } catch (err) {
    console.error('Error in getFever:', err);
    return res.status(500).json({ error: err.message });
  }
};

export const postFever = async (req, res, next) => {
  try {
    const arr = responseBase();

    //check if api_key is provided, clients implement the api_key in different ways
    if ("api_key" in req.query || req.body?.api_key) {
      console.log("api_key found in query");
      const loggedInUser = await User.findOne({
          where: {
            hash: req.query.api_key || req.body?.api_key
          }
        });
      if (!loggedInUser?.id) {
        //api_key is invalid
        return res.status(200).json(arr);
      } else {
        //api_key is valid
        arr['auth'] = 1;

        //when argument is groups, retrieve list with categories names and id's
        if ("groups" in req.query) {
          const groups = [];
          const categories = await Category.findAll({
            where: {
              userId: loggedInUser.id
            },
            order: [['categoryOrder', 'ASC'], ['name', 'ASC']]
          });
          if (categories) {
            categories.forEach(category => {
              const categoryObject = {
                id: category.id,
                title: category.name
              };
              groups.push(categoryObject);
            });
          }
          //append groups to arr
          arr['groups'] = groups;
        }

        //when argument is feeds, retrieve list with feed details
        if ("feeds" in req.query) {
          const feeds = [];
          const results = await Feed.findAll({
            where: {
              userId: loggedInUser.id
            },
            order: [['feedName', 'ASC']]
          });
          if (results) {
            results.forEach(feed => {
              const feedObject = {
                id: feed.id,
                favicon_id: feed.id, // Using feed id as favicon_id
                title: feed.feedName,
                url: feed.url, // RSS feed URL
                site_url: feed.link, // Website URL
                is_spark: 0,
                last_updated_on_time: Math.floor(feed.updatedAt / 1000)
              };
              feeds.push(feedObject);
            });
          }
          //append feeds to arr
          arr['feeds'] = feeds;
        }

        if ("groups" in req.query || "feeds" in req.query) {
          //create empty feeds_groups array
          const feeds_groups = [];

          //get all categories including feeds
          const categories = await Category.findAll({
            where: {
              userId: loggedInUser.id
            },
            include: [{
              model: Feed,
              required: true
            }],
            order: [['categoryOrder', 'ASC'], ['name', 'ASC']]
          });

          //if categories is defined
          if (categories) {
            categories.forEach((category) => {

              //create empty feedIds array
              const feedIds = [];

              //push all feed ids to the array
              category.feeds.forEach((feed) => {
                feedIds.push(feed.id);
              });

              //create a feedgroup object holding the category id and feeds (comma seperated)
              const feedGroupObject = {
                group_id: category.id,
                feed_ids: feedIds.join(", ")
              };

              //push the object to the feeds_groups array
              feeds_groups.push(feedGroupObject);
            });
          }
          //append feeds_groups to arr
          arr['feeds_groups'] = feeds_groups;
        }

        //return list with all unread article id's
        if ("unread_item_ids" in req.query) {
          const unread_item_ids = [];
          const articles = await Article.findAll({
            attributes: ["id"],
            where: {
              status: 'unread',
              userId: loggedInUser.id
            },
            order: [['id', 'ASC']]
          });
          if (articles) {
            articles.forEach(article => {
              unread_item_ids.push(article.id);
            });
          }
          //string/comma-separated list of positive integers instead of array
          arr['unread_item_ids'] = unread_item_ids.join(",");
        }

        //return string/comma-separated list with id's from starred articles
        if ("saved_item_ids" in req.query) {
          const saved_item_ids = [];
          const articles = await Article.findAll({
            attributes: ["id"],
            where: {
              starInd: 1,
              userId: loggedInUser.id
            },
            order: [['id', 'ASC']]
          });
          if (articles) {
            articles.forEach(article => {
              saved_item_ids.push(article.id);
            });
          }
          //string/comma-separated list of positive integers instead of array
          arr['saved_item_ids'] = saved_item_ids.join(",");
        }

        //return articles with optional filtering
        if ("items" in req.query) {
          //add total number of articles to arr
          const total_articles = await Article.count();
          arr['total_items'] = total_articles;

          //create empty items array where all articles will be pushed to
          const items = [];

          let articles;
          //request specific items, a maximum of 50 specific items requested by comma-separated argument
          if (req.query.with_ids) {
            //list with id's is comma-separated, so transform to array
            const arrayIds = req.query.with_ids.split(',');

            articles = await Article.findAll({
              where: {
                id: arrayIds,
                userId: loggedInUser.id
              }
            });
            //request 50 additional items using the highest id of locally cached items
          } else if (req.query.since_id) {

            articles = await Article.findAll({
              where: {
                id: {
                  [Op.gt]: req.query.since_id
                },
                userId: loggedInUser.id
              },
              limit: 50
            });
            //request 50 previous items using the lowest id of locally cached items
          } else if (req.query.max_id) {

            articles = await Article.findAll({
              where: {
                id: {
                  [Op.lt]: req.query.max_id
                },
                userId: loggedInUser.id
              },
              limit: 50
            });
            //if no argument is given provide total_items and up to 50 items
          } else {
            articles = await Article.findAll({
              where: {
                userId: loggedInUser.id
              },
              order: [['id', 'ASC']],
              limit: 50
            });
          }

          articles.forEach((article) => {
            const articleObject = {
              id: article.id,
              feed_id: parseInt(article.feedId),
              title: article.subject,
              author: '',
              html: article.content,
              url: article.url,
              is_saved: parseInt(article.starInd),
              is_read: (article.status === 'read' ? 1 : 0),
              created_on_time: Math.floor(article.published / 1000)
            };
            items.push(articleObject);
          });

          //add items to arr
          arr['items'] = items;

        }

        //when argument is links, return hot links
        if ("links" in req.query) {
          // Support optional offset, range, page parameters (defaults: offset=0, range=7, page=1)
          const offset = parseInt(req.query.offset) || 0;
          const range = parseInt(req.query.range) || 7;
          const page = parseInt(req.query.page) || 1;
          
          //select all items with hot links
          const whereClause = {
            url: cache.all(),
            userId: loggedInUser.id
          };
          
          if (req.query.since_id) {
            whereClause.id = { [Op.gt]: req.query.since_id };
          }
          
          const articles = await Article.findAll({
            where: whereClause
          });

          const item_ids = [];

          if (articles) {
            articles.forEach(article => {
              item_ids.push(article.id);
            });
          }

          const links = [];
          articles.forEach((article) => {
            const articleObject = {
              id: article.id,
              feed_id: parseInt(article.feedId),
              item_id: parseInt(article.feedId),
              //calculate dynamically the hotness
              temperature: 99 + article.hotlinks,
              is_item: 1,
              is_local: 1,
              is_saved: parseInt(article.starInd),
              title: article.subject,
              url: article.url,
              //string/comma-separated list of positive integers of all hot links
              item_ids: item_ids.join(",")
            };
            links.push(articleObject);
          });

          //add links to arr
          arr['links'] = links;
        }

        //favicons
        if ("favicons" in req.query) {
          const favicons = [];
          const feeds = await Feed.findAll({
            order: [['feedName', 'ASC']]
          });
          if (feeds) {
            feeds.forEach(feed => {
              const faviconObject = {
                id: feed.id,
                data: feed.favicon || '' // Should be format: image/gif;base64,R0lGOD...
              };
              favicons.push(faviconObject);
            });
          }
          //append favicons to arr
          arr['favicons'] = favicons;
        }

        //set before argument, which needs to be a JavaScript Data Object for Sequelize
        let timestamp;
        if ("before" in req.query) {
          timestamp = Date.parse(req.body.before * 1000);
        } else {
          //Fever uses the Unix timestamp, so multiplied by 1000 so that the argument is in milliseconds, not seconds.
          timestamp = Date.now();
        }

        //unread recently read items
        if ("unread_recently_read" in req.query && req.query.unread_recently_read === '1') {
          // Mark recently read items as unread (within last 24 hours)
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          await Article.update(
            { status: 'unread' },
            {
              where: {
                status: 'read',
                updatedAt: { [Op.gte]: oneDayAgo },
                userId: loggedInUser.id
              }
            }
          );
        }

        //check if mark argument is provided, which means that articles need to be updated
        if ("mark" in req.query) {
          //update per article item
          if (req.body.mark === "item" && req.body.id) {
            const update = genUpdate(req.body.as);
            await Article.update(update, {
              where: {
                id: req.body.id,
                userId: loggedInUser.id
              }
            });
          }

          //update per feed
          if (req.body.mark === "feed" && req.body.id) {
            const update = genUpdate(req.body.as);
            await Article.update(update, {
              where: {
                feedId: req.body.id,
                published: {
                  [Op.lte]: timestamp
                },
                userId: loggedInUser.id
              }
            });
          }

          //per group, a group should be specified with an id not equal to zero
          if (req.body.mark === "group" && req.body.id !== undefined) {
            const update = genUpdate(req.body.as);

            const where = {
              published: {
                [Op.lte]: timestamp
              },
              userId: loggedInUser.id
            };

            // id === '0' means all items (Kindling super group)
            // id === '-1' means Sparks super group (feeds with is_spark = 1)
            if (req.body.id !== '0' && req.body.id !== '-1') {
              where['feedId'] = Number(req.body.id);
            }
            // Note: is_spark filtering would need to be added when that feature is implemented

            await Article.update(update, {
              where,
              userId: loggedInUser.id
            });
          }
        }
      }
    }


    //return 200 with arr
    res.status(200).json(arr);
  } catch (err) {
    console.error('Error in postFever:', err);
    return res.status(500).json({ error: err.message });
  }
};

function responseBase() {
  //return auth 0, as no authentication is implemented
  const auth = 0;

  //latest api version is 3
  const api_version = 3;

  return {
    api_version,
    auth,
    last_refreshed_on_time: String(Math.floor((new Date()).getTime() / 1000))
  };
}

function genUpdate(req_body_as) {
  switch (req_body_as) {
    case "read":
      return {
        status: 'read'
      };

    case "unread":
      return {
        status: 'unread'
      };

    case "saved":
      return {
        starInd: 1
      };

    case "unsaved":
      return {
        starInd: 0
      };
  }
}

export default {
  getFever,
  postFever
}