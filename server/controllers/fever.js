const Article = require("../models/article");
const Feed = require("../models/feed");
const Category = require("../models/category");

const Sequelize = require("sequelize");
const Op = Sequelize.Op;

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

    //when argument is groups, retrieve list with categories and id's
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
      arr['feeds_groups'] = groups;
    }

    //return list with all unread article id's
    if ("unread_item_ids" in req.query) {
      var unread_item_ids = [];
      articles = await Article.findAll({
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
      articles = await Article.findAll({
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

    //when argument is links, don't return anything at this moment
    if ("links" in req.query) {
      //return empty array for this moment
      arr['links'] = [];
    }

    //favicons
    if ("favicons" in req.query) {
      var favicons = [];
      feeds = await Feed.findAll({
        order: [
          ['feed_name', 'ASC']
        ]
      });
      if (feeds) {
        feeds.forEach(feed => {
          feedObject = {
            id: String(feed.id),
            favicon: feed.favicon
          }
          favicons.push(feedObject);
        });
      }
      //append favicons to arr
      arr['favicons'] = favicons;
    }

    //return 200 with arr
    res.status(200).json(arr);

  } catch (err) {
    console.log(err);
  }
};

exports.postFever = async (req, res, next) => {
  try {
    //return all itemIds
    res.status(200).json('result');

  } catch (err) {
    console.log(err);
  }
};