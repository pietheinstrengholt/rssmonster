import Article from "../models/article.js";
import Feed from "../models/feed.js";
import Setting from "../models/setting.js";
import cache from "../util/cache.js";
import Sequelize from 'sequelize';

const Op = Sequelize.Op;

//the getArticles function returns an array with all the article ids
const getArticles = async (req, res, next) => {
  try {
    //use query parameters instead if provided
    var categoryId = req.query.categoryId ? req.query.categoryId : "%";
    var feedId = req.query.feedId ? req.query.feedId : "%";
    var status = req.query.status ? req.query.status : "unread";
    var sort = req.query.sort ? req.query.sort : "DESC";

    //set default values before querying all items
    let search = req.query.search || "%";
    if (search !== "%") search = "%" + search + "%";

    //populate an array with all the feed ids based on the categoryId
    if (categoryId == "%") {
      var feeds = await Feed.findAll({
        attributes: ["id"]
      });
    } else {
      var feeds = await Feed.findAll({
        attributes: ["id"],
        where: {
          categoryId: {
            [Op.like]: categoryId
          }
        }
      });
    }

    //if the feedId is set, set it equal to all feedIds
    if (feedId != "%") {
      var feedIds = feedId;
    } else {
      //build array based on previous results and push all ids to the array
      feedIds = [];
      if (feeds.length > 0) {
        feeds.forEach(feed => {
          feedIds.push(feed.id);
        });
      }
    }

    //if star isn't set, then use the status field to query against
    if (status != "star") {
      var articles = await Article.findAll({
        attributes: ["id"],
        order: [["published", sort]],
        where: {
          status: status,
          feedId: feedIds,
          subject: {
            [Op.like]: search
          },
          content: {
            [Op.like]: search
          }
        }
      });
    }

    //if star is set, then use the starInd field to query against
    if (status == "star") {
      var articles = await Article.findAll({
        attributes: ["id"],
        order: [["published", sort]],
        where: {
          feedId: feedIds,
          subject: {
            [Op.like]: search
          },
          content: {
            [Op.like]: search
          },
          starInd: 1
        }
      });
    }

    //if hot is set, then use an inner join and no separate query, and no feedId arguments
    if (status == "hot") {

      //finally we count using the array with ids
      var articles = await Article.findAll({
        attributes: ["id"],
        order: [["published", sort]],
        where: {
          subject: {
            [Op.like]: search
          },
          content: {
            [Op.like]: search
          },
          url: cache.all()
        }
      });
    }

    //push all ids to the array
    var itemIds = [];
    if (articles.length > 0) {
      articles.forEach(article => {
        itemIds.push(article.id);
      });
    }

    //return all query params and itemIds
    res.status(200).json({
      query: [
        {
          categoryId: categoryId,
          feedId: feedId,
          sort: sort,
          status: status,
          search: search
        }
      ],
      itemIds: itemIds
    });

    //destroy settings
    await Setting.destroy({ where: {} });

    //update all settings
    await Setting.create({
      categoryId: categoryId,
      feedId: feedId,
      status: status,
      sort: sort
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

//the getArticle function returns the article details based on the articleId (array) argument
const getArticle = (req, res, next) => {
  const articleId = req.params.articleId;
  Article.findByPk(articleId, {
    include: [
      {
        model: Feed,
        required: true
      }
    ]
  })
    .then(article => {
      res.status(200).json({
        article: article
      });
    })
    .catch(err => {
      console.log(err);
      return res.status(500).json(err);
    });
};

//the postArticles function marks all articles as read
const postArticles = (req, res, next) => {
  try {
    Article.update(
      {
        status: "read"
      },
      {
        where: { status: "unread" }
      }
    );

    res.status(200).json("all articles marked as read");
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

export default {
  getArticles,
  getArticle,
  postArticles
}