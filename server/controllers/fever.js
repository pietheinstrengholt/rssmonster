const Article = require("../models/article");
const Feed = require("../models/feed");
const Category = require("../models/category");

const Sequelize = require("sequelize");
const Op = Sequelize.Op;

//use Fever API
//specs: https://feedafever.com/api

exports.getFever = async (req, res, next) => {
  try {
    //always return status 1: password and username correct
    const status = 1;

    //latest api version is 3
    var arr = {
      api_version: "3",
      auth: status
    }

    //last refreshed is current system time
    var time = {
      last_refreshed_on_time: Math.floor((new Date()).getTime() / 1000)
    };

    //merge arrays
    arr = Object.assign(arr, time);

    //when argument is groups, retrieve list with categories names and id's
    if ("groups" in req.query) {
      var groups = [];
      const categories = await Category.findAll({
        order: ['category_order', 'name']
      })
      if (categories) {
        categories.forEach(category => {
          categoryObject = {
            id: String(category.id),
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
        order: ['feed_name']
      })
      if (results) {
        results.forEach(feed => {
          feedObject = {
            id: String(feed.id),
            favicon: '<img src="data:' + feed.favicon + '">',
            title: feed.feed_name,
            url: feed.url,
            site_url: feed.url,
            is_spark: 0,
            last_updated_on_time: Math.floor(feed.updatedAt / 1000)
          }
          feeds.push(feedObject);
        });
      }
      //append groups to arr
      arr['feed'] = feeds;
    }

    if ("groups" in req.query || "feeds" in req.query) {
      //create empty feeds_groups array
      var feeds_groups = [];

      //get all categories including feeds
      categories = await Category.findAll({
        include: [{
          model: Feed,
          required: true
        }],
        order: ['category_order', 'name']
      })

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
          feedGroupObject = {
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
      arr['unread_item_ids'] = unread_item_ids.join(", ");
    }

    //return string/comma-separated list with id's from read and starred articles
    if ("saved_item_ids" in req.query) {
      var unread_item_ids = [];
      const articles = await Article.findAll({
        attributes: ["id"],
        where: {
          star_ind: 1
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
      arr['saved_item_ids'] = unread_item_ids.join(", ");
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

        articles = await Article.findAll({
          where: {
            id: arrayIds
          }
        });
        //request 50 additional items using the highest id of locally cached items
      } else if (req.query.since_id) {

        articles = await Article.findAll({
          where: {
            id: {
              [Op.gt]: req.query.since_id
            }
          },
          limit: 50
        });
        //request 50 previous items using the lowest id of locally cached items
      } else if (req.query.max_id) {

        articles = await Article.findAll({
          where: {
            id: {
              [Op.lt]: req.query.max_id
            }
          },
          limit: 50
        });
        //if no argument is given provide total_items and up to 50 items
      } else {
        articles = await Article.findAll({
          order: [
            ['id', 'ASC']
          ],
          limit: 50
        });
      }

      await articles.forEach(function (article) {
        articleObject = {
          id: String(article.id),
          feed_id: parseInt(article.feedId),
          title: article.subject,
          author: '',
          html: article.content,
          url: article.url,
          is_saved: parseInt(article.star_ind),
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
      //return empty array for this moment
      arr['links'] = [];
    }

    //favicons
    if ("favicons" in req.query) {
      var favicons = [];
      const feeds = await Feed.findAll({
        order: [
          ['feed_name', 'ASC']
        ]
      });
      if (feeds) {
        feeds.forEach(feed => {
          feedObject = {
            id: String(feed.id),
            favicon: '<img src="data:' + feed.favicon + '">'
          };
          favicons.push(feedObject);
        });
      }
      //append favicons to arr
      arr['favicons'] = favicons;
    }

    //return 200 with arr
    res.status(200).json(arr);

  } catch (err) {
    //return server if something goes wrong
    console.log(err);
    return res.status(500).json(err);
  }
};

exports.postFever = async (req, res, next) => {
  try {

    //set before argument, which needs to be a JavaScript Data Object for Sequelize
    if (req.query.before) {
      var timestamp = Date.now();
    } else {
      //Fever uses the Unix timestamp, so multiplied by 1000 so that the argument is in milliseconds, not seconds.
      var timestamp = Date.parse(req.query.before * 1000);
    }

    //update per article item
    if (req.query.mark === "item" && req.query.id) {
      if (req.query.as === "read") {
        Article.update({
          status: 'read'
        }, {
          where: {
            id: req.query.id
          }
        });
      }
      if (req.query.as === "saved") {
        Article.update({
          star_ind: 1
        }, {
          where: {
            id: req.query.id
          }
        });
      }
      if (req.query.as === "unsaved") {
        Article.update({
          status: 'unread'
        }, {
          where: {
            id: req.query.id
          }
        });
      }
    }

    //update per feed
    if (req.query.mark === "feed" && req.query.id) {
      if (req.query.as === "read") {
        Article.update({
          status: 'read'
        }, {
          where: {
            feedId: req.query.id,
            published: {
              [Op.lte]: timestamp
            }
          }
        });
      }
      if (req.query.as === "saved") {
        Article.update({
          star_ind: 1
        }, {
          where: {
            feedId: req.query.id,
            published: {
              [Op.lte]: timestamp
            }
          }
        });
      }
      if (req.query.as === "unsaved") {
        Article.update({
          status: 'unread'
        }, {
          where: {
            feedId: req.query.id,
            published: {
              [Op.lte]: timestamp
            }
          }
        });
      }
    }

    //per group, a group should be specified with an id not equal to zero
    if (req.query.mark === "group" && req.query.id !== 0) {

      //get all feed ids
      feeds = await Feed.findAll({
        attributes: ["id"]
      });

      //build array based on previous results and push all ids to the array
      feedIds = [];
      if (feeds.length > 0) {
        feeds.forEach(feed => {
          feedIds.push(feed.id);
        });
      }

      if (req.query.as === "read") {
        Article.update({
          status: 'read'
        }, {
          where: {
            feedId: feedIds,
            published: {
              [Op.lte]: timestamp
            }
          }
        });
      }
      if (req.query.as === "saved") {
        Article.update({
          star_ind: 1
        }, {
          where: {
            feedId: feedIds,
            published: {
              [Op.lte]: timestamp
            }
          }
        });
      }
      if (req.query.as === "unsaved") {
        Article.update({
          status: 'unread'
        }, {
          where: {
            feedId: feedIds,
            published: {
              [Op.lte]: timestamp
            }
          }
        });
      }

    }

    //this is "all" according fever
    if (req.query.mark === "group" && req.query.id === 0) {

      if (req.query.as === "read") {
        Article.update({
          status: 'read'
        }, {
          where: {
            published: {
              [Op.lte]: timestamp
            }
          }
        });
      }
      if (req.query.as === "saved") {
        Article.update({
          star_ind: 1
        }, {
          where: {
            published: {
              [Op.lte]: timestamp
            }
          }
        });
      }
      if (req.query.as === "unsaved") {
        Article.update({
          status: 'unread'
        }, {
          where: {
            published: {
              [Op.lte]: timestamp
            }
          }
        });
      }

    }

    //return 200 code
    res.status(200).json('OK');

  } catch (err) {
    //return server if something goes wrong
    console.log(err);
    return res.status(500).json(err);
  }
};