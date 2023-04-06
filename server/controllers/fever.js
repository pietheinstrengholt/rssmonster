import Article from "../models/article.js";
import Feed from "../models/feed.js";
import Category from "../models/category.js";
import cache from '../util/cache.js';

import Sequelize from "sequelize";
const Op = Sequelize.Op;

//use Fever API
//specs: https://feedafever.com/api

export const getFever = async (req, res, next) => {
  try {
    var arr = responseBase();

    //return 200 with arr
    res.status(200).json(arr);

  } catch (err) {
    //return server if something goes wrong
    console.log(err);
    return res.status(500).json(err);
  }
};

export const postFever = async (req, res, next) => {
  try {
    var arr = responseBase();

    //when argument is groups, retrieve list with categories names and id's
    if ("groups" in req.query) {
      var groups = [];
      const categories = await Category.findAll({
        order: ['categoryOrder', 'name']
      });
      if (categories) {
        categories.forEach(category => {
          var categoryObject = {
            id: category.id,
            title: category.name
          }
          groups.push(categoryObject);
        });
      }
      //append groups to arr
      arr['groups'] = groups;
    }

    //when argument is groups, retrieve list with categories names and id's
    if ("feeds" in req.query) {
      var feeds = [];
      const results = await Feed.findAll({
        order: ['feedName']
      });
      if (results) {
        results.forEach(feed => {
          var feedObject = {
            id: String(feed.id),
            favicon: '<img src="data:' + feed.favicon + '">',
            title: feed.feedName,
            url: feed.rssUrl,
            site_url: feed.url,
            is_spark: 0,
            last_updated_on_time: Math.floor(feed.updatedAt / 1000)
          }
          feeds.push(feedObject);
        });
      }
      //append groups to arr
      arr['feeds'] = feeds;
    }

    if ("groups" in req.query || "feeds" in req.query) {
      //create empty feeds_groups array
      var feeds_groups = [];

      //get all categories including feeds
      var categories = await Category.findAll({
        include: [{
          model: Feed,
          required: true
        }],
        order: ['categoryOrder', 'name']
      });

      //if categories is defined
      if (categories) {
        categories.forEach(function (category, i) {

          //create empty feedIds array
          var feedIds = [];

          //push all feed ids to the array
          category.feeds.forEach(function (feed, i) {
            feedIds.push(feed.id);
          });

          //create a feedgroup object holding the category id and feeds (comma seperated)
          var feedGroupObject = {
            group_id: category.id,
            feed_ids: feedIds.join(", ")
          }

          //push the object to the feeds_groups array
          feeds_groups.push(feedGroupObject);
        });
      }
      //append groups to arr
      arr['feeds_groups'] = feeds_groups;
    }

    //return list with all unread article id's
    if ("unread_item_ids" in req.query) {
      var unread_item_ids = [];
      const articles = await Article.findAll({
        attributes: ["id"],
        where: {
          status: 'unread'
        },
        order: [
          ['id', 'ASC']
        ]
      });
      if (articles) {
        articles.forEach(article => {
          unread_item_ids.push(article.id);
        });
      }
      //string/comma-separated list of positive integers instead of array
      arr['unread_item_ids'] = unread_item_ids.join(",");
    }

    //return string/comma-separated list with id's from read and starred articles
    if ("saved_item_ids" in req.query) {
      var unread_item_ids = [];
      const articles = await Article.findAll({
        attributes: ["id"],
        where: {
          starInd: 1
        },
        order: [
          ['id', 'ASC']
        ]
      });
      if (articles) {
        articles.forEach(article => {
          unread_item_ids.push(article.id);
        });
      }
      //string/comma-separated list of positive integers instead of array
      arr['saved_item_ids'] = unread_item_ids.join(",");
    }

    //return string/comma-separated list with id's from read and starred articles
    if ("items" in req.query) {
      //add total number of articles to arr
      const total_articles = await Article.count();
      arr['total_items'] = total_articles;

      //create empty items array where all articles will be pushed to
      var items = [];

      //request specific items, a maximum of 50 specific items requested by comma-separated argument
      if (req.query.with_ids) {
        //list with id's is comma-separated, so transform to array
        var arrayIds = req.query.with_ids.split(',');

        var articles = await Article.findAll({
          where: {
            id: arrayIds
          }
        });
        //request 50 additional items using the highest id of locally cached items
      } else if (req.query.since_id) {

        var articles = await Article.findAll({
          where: {
            id: {
              [Op.gt]: req.query.since_id
            }
          },
          limit: 50
        });
        //request 50 previous items using the lowest id of locally cached items
      } else if (req.query.max_id) {

        var articles = await Article.findAll({
          where: {
            id: {
              [Op.lt]: req.query.max_id
            }
          },
          limit: 50
        });
        //if no argument is given provide total_items and up to 50 items
      } else {
        var articles = await Article.findAll({
          order: [
            ['id', 'ASC']
          ],
          limit: 50
        });
      }

      await articles.forEach(function (article) {
        var articleObject = {
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

    //when argument is links, don't return anything at this moment
    if ("links" in req.query) {
      
      //select all items with hot links
      var articles = await Article.findAll({
        where: {
          id: {
            [Op.gt]: req.query.since_id,
            url: cache.all()
          }
        },
        include: [
          {
            where: {
              url: {
                [Op.not]: null
              }
            },
            required: true
          }]
      });

      var item_ids = [];

      if (articles) {
        articles.forEach(article => {
          item_ids.push(article.id);
        });
      }

      await articles.forEach(function (article) {
        var articleObject = {
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
        items.push(articleObject);
      });

      //add links to arr
      arr['links'] = items;
    }

    //favicons
    if ("favicons" in req.query) {
      var favicons = [];
      const feeds = await Feed.findAll({
        order: [
          ['feedName', 'ASC']
        ]
      });
      if (feeds) {
        feeds.forEach(feed => {
          var feedObject = {
            id: String(feed.id),
            favicon: '<img src="data:' + feed.favicon + '">'
          };
          favicons.push(feedObject);
        });
      }
      //append favicons to arr
      arr['favicons'] = favicons;
    }

    //set before argument, which needs to be a JavaScript Data Object for Sequelize
    if (req.body.before) {
      var timestamp = Date.now();
    } else {
      //Fever uses the Unix timestamp, so multiplied by 1000 so that the argument is in milliseconds, not seconds.
      var timestamp = Date.parse(req.body.before * 1000);
    }

    //update per article item
    if (req.body.mark === "item" && req.body.id) {
      const update = genUpdate(req.body.as);
      Article.update(update, {
        where: {
          id: req.body.id
        }
      });
    }

    //update per feed
    if (req.body.mark === "feed" && req.body.id) {
      const update = genUpdate(req.body.as);
      Article.update(update, {
        where: {
          feedId: req.body.id,
          published: {
            [Op.lte]: timestamp
          }
        }
      });
    }

    //per group, a group should be specified with an id not equal to zero
    if (req.body.mark === "group" && req.body.id !== undefined) {
      const update = genUpdate(req.body.as);

      var where = {
        published: {
          [Op.lte]: timestamp
        }
      };

      // id === '0' means all
      if (req.body.id !== '0') {
        where['feedId'] = Number(req.body.id);
      }

      Article.update(update, {
        where: where
      });
    }

    //return 200 with arr
    res.status(200).json(arr);
  } catch (err) {
    //return server if something goes wrong
    console.log(err);
    return res.status(500).json(err);
  }
};

function responseBase() {
  //always return auth 1: password and username correct
  const auth = 1;

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