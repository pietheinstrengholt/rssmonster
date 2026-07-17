import db from '../models/index.js';
const { Feed, Category, Article, User, Hotlink } = db;
import { Op } from 'sequelize';
import { canonicalArticleWhere } from '../services/duplicates/articleDuplicates.js';

//use Fever API
//specs: https://github.com/dasmurphy/tinytinyrss-fever-plugin/blob/master/fever-api.md

export const getFever = async (req, res, _next) => {
  try {
    const arr = responseBase();

    //return 200 with arr
    res.status(200).json(arr);

  } catch (err) {
    console.error('Error in getFever:', err);
    return res.status(500).json({ error: err.message });
  }
};

export const postFever = async (req, res, _next) => {
  try {
    const arr = responseBase();
    const apiKey = req.body?.api_key || req.query.api_key;

    //check if api_key is provided, clients implement the api_key in different ways
    if (apiKey) {
      console.log("api_key found");
      const loggedInUser = await User.findOne({
          where: {
            hash: apiKey
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
                site_url: feed.url,
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

              //create a feedgroup object holding the category id and feeds (comma separated)
              const feedGroupObject = {
                group_id: category.id,
                feed_ids: feedIds.join(",")
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
              userId: loggedInUser.id,
              ...canonicalArticleWhere()
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
              favoriteInd: 1,
              userId: loggedInUser.id,
              ...canonicalArticleWhere()
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
          const total_articles = await Article.count({
            where: {
              userId: loggedInUser.id,
              ...canonicalArticleWhere()
            }
          });
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
                userId: loggedInUser.id,
                ...canonicalArticleWhere()
              },
              order: [['id', 'ASC']],
              limit: 50
            });
            //request 50 additional items using the highest id of locally cached items
          } else if (req.query.since_id) {

            articles = await Article.findAll({
              where: {
                id: {
                  [Op.gt]: req.query.since_id
                },
                userId: loggedInUser.id,
                ...canonicalArticleWhere()
              },
              order: [['id', 'ASC']],
              limit: 50
            });
            //request 50 previous items using the lowest id of locally cached items
          } else if (req.query.max_id) {

            articles = await Article.findAll({
              where: {
                id: {
                  [Op.lt]: req.query.max_id
                },
                userId: loggedInUser.id,
                ...canonicalArticleWhere()
              },
              order: [['id', 'DESC']],
              limit: 50
            });
            //if no argument is given provide total_items and up to 50 items
          } else {
            articles = await Article.findAll({
              where: {
                userId: loggedInUser.id,
                ...canonicalArticleWhere()
              },
              order: [['id', 'ASC']],
              limit: 50
            });
          }

          articles.forEach((article) => {
            const articleObject = {
              id: article.id,
              feed_id: parseInt(article.feedId),
              title: article.title,
              author: article.author || '',
              html: article.contentOriginal || article.contentHtml || article.description || '',
              url: article.url,
              is_saved: parseInt(article.favoriteInd),
              is_read: (article.status === 'read' ? 1 : 0),
              created_on_time: Math.floor(article.publishedAt / 1000)
            };
            items.push(articleObject);
          });

          //add items to arr
          arr['items'] = items;

        }

        //when argument is links, return hot links
        if ("links" in req.query) {
          // Support optional offset, range, page parameters (defaults: offset=0, range=7, page=1)
          // These parameters are reserved for future pagination implementation

          const hotlinks = await Hotlink.findAll({
            attributes: ['url'],
            where: {
              userId: loggedInUser.id
            }
          });
          const hotlinkUrls = [...new Set(hotlinks.map(row => row.url).filter(Boolean))];

          const whereClause = {
            url: {
              [Op.in]: hotlinkUrls
            },
            userId: loggedInUser.id,
            ...canonicalArticleWhere()
          };

          if (req.query.since_id) {
            whereClause.id = { [Op.gt]: req.query.since_id };
          }

          const articles = await Article.findAll({
            where: whereClause,
            order: [['id', 'ASC']]
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
              is_saved: parseInt(article.favoriteInd),
              title: article.title,
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
            where: {
              userId: loggedInUser.id
            },
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

        const mark = req.body?.mark || req.query.mark;
        const markAs = req.body?.as || req.query.as;
        const markId = req.body?.id ?? req.query.id;
        const before = req.body?.before ?? req.query.before;
        const timestamp = feverUnixTimestampToDate(before);
        const unreadRecentlyRead = req.body?.unread_recently_read || req.query.unread_recently_read;

        //unread recently read items
        if (unreadRecentlyRead === '1') {
          // Mark recently read items as unread (within last 24 hours)
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          await Article.update(
            { status: 'unread' },
            {
              where: {
                status: 'read',
                updatedAt: { [Op.gte]: oneDayAgo },
                userId: loggedInUser.id,
                ...canonicalArticleWhere()
              }
            }
          );
        }

        //check if mark argument is provided, which means that articles need to be updated
        if (mark) {
          const update = genUpdate(markAs);

          if (!update) {
            return res.status(200).json(arr);
          }

          //update per article item
          if (mark === "item" && markId !== undefined) {
            await Article.update(update, {
              where: {
                id: markId,
                userId: loggedInUser.id,
                ...canonicalArticleWhere()
              }
            });
          }

          //update per feed
          if (mark === "feed" && markId !== undefined) {
            await Article.update(update, {
              where: {
                feedId: markId,
                publishedAt: {
                  [Op.lte]: timestamp
                },
                userId: loggedInUser.id,
                ...canonicalArticleWhere()
              }
            });
          }

          //per group, a group should be specified with an id not equal to zero
          if (mark === "group" && markId !== undefined) {
            const where = {
              publishedAt: {
                [Op.lte]: timestamp
              },
              userId: loggedInUser.id,
              ...canonicalArticleWhere()
            };

            // id === '0' means all items (Kindling super group)
            // id === '-1' means Sparks super group (feeds with is_spark = 1)
            if (String(markId) === '-1') {
              return res.status(200).json(arr);
            }

            if (String(markId) !== '0') {
              const categoryFeeds = await Feed.findAll({
                attributes: ['id'],
                where: {
                  categoryId: markId,
                  userId: loggedInUser.id
                }
              });
              const feedIds = categoryFeeds.map(feed => feed.id);

              if (feedIds.length === 0) {
                return res.status(200).json(arr);
              }

              where['feedId'] = {
                [Op.in]: feedIds
              };
            }
            // Note: is_spark filtering would need to be added when that feature is implemented

            await Article.update(update, {
              where
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
        favoriteInd: 1
      };

    case "unsaved":
      return {
        favoriteInd: 0
      };
  }
}

function feverUnixTimestampToDate(value) {
  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return new Date();
  }

  return new Date(seconds * 1000);
}

export default {
  getFever,
  postFever
}
