import Article from "../models/article.js";
import Category from "../models/category.js";
import Feed from "../models/feed.js";

import cache from '../util/cache.js';

import Sequelize from "sequelize";

export const getOverview = async (req, res, next) => {
  try {
    const starCount = await Article.count({
      where: {
        starInd: 1
      }
    });

    const unreadCount = await Article.count({
      where: {
        status: "unread"
      }
    });

    const readCount = await Article.count({
      where: {
        status: "read"
      }
    });

    //finally we count using the array with ids
    const hotCount = await Article.count({
      where: {
        url: cache.all()
      }
    });

    const totalCount = (await readCount) + unreadCount;

    const categories = await Category.findAll({
      include: [{
        model: Feed,
        required: false
      }],
      order: ["categoryOrder", "name"]
    });

    const unreadCountGrouped = await Feed.findAll({
      include: [{
        model: Article,
        attributes: [],
        where: {
          status: "unread"
        }
      }],
      attributes: [
        "categoryId",
        ["id", "feedId"],
        [Sequelize.fn("COUNT", "article.id"), "count"]
      ],
      order: ["id"],
      group: ["categoryId", "id"]
    });

    const readCountGrouped = await Feed.findAll({
      include: [{
        model: Article,
        attributes: [],
        where: {
          status: "read"
        }
      }],
      attributes: [
        "categoryId",
        ["id", "feedId"],
        [Sequelize.fn("COUNT", "article.id"), "count"]
      ],
      order: ["id"],
      group: ["categoryId", "id"]
    });

    const starCountGrouped = await Feed.findAll({
      include: [{
        model: Article,
        attributes: [],
        where: {
          starInd: 1
        }
      }],
      attributes: [
        "categoryId",
        ["id", "feedId"],
        [Sequelize.fn("COUNT", "article.id"), "count"]
      ],
      order: ["id"],
      group: ["categoryId", "id"]
    });

    const toPlain = response => {
      const flattenDataValues = ({
        dataValues
      }) => {
        const flattenedObject = {};
        Object.keys(dataValues).forEach(key => {
          const dataValue = dataValues[key];
          if (
            Array.isArray(dataValue) &&
            dataValue[0] &&
            dataValue[0].dataValues &&
            typeof dataValue[0].dataValues === "object"
          ) {
            flattenedObject[key] = dataValues[key].map(flattenDataValues);
          } else if (
            dataValue &&
            dataValue.dataValues &&
            typeof dataValue.dataValues === "object"
          ) {
            flattenedObject[key] = flattenDataValues(dataValues[key]);
          } else {
            flattenedObject[key] = dataValues[key];
          }
        });
        return flattenedObject;
      };
      return Array.isArray(response) ?
        response.map(flattenDataValues) :
        flattenDataValues(response);
    };

    //Sequelize raw: true or plain: true results into errors, so we will use the custom toPlain function here
    //we need to manipulate the results, so it is required to transform these into plain Array's
    var categoriesArray = await toPlain(categories);
    var readArray = await toPlain(readCountGrouped);
    var unreadArray = await toPlain(unreadCountGrouped);
    var starArray = await toPlain(starCountGrouped);
    //hotArray = await toPlain(hotCountGrouped);

    //give each category and feed in the categoriesArray a readCount, unreadCount and starCount
    await categoriesArray.forEach(category => {
      category["readCount"] = 0;
      category["unreadCount"] = 0;
      category["starCount"] = 0;
      category["hotCount"] = 0;
      if (category["feeds"]) {
        category["feeds"].forEach(feed => {
          feed["readCount"] = 0;
          feed["unreadCount"] = 0;
          feed["starCount"] = 0;
          feed["hotCount"] = 0;
        });
      }
    });

    //the readArray holds the read count for every categoryId and feedId. For the categoryId we need to sum, for the feedId we can just overwrite.
    await readArray.forEach(item => {
      //find the index by comparing the categoryId from every element in the readArray, against the category.id in the categoriesArray
      var categoryIndex = categoriesArray.findIndex(
        category => category.id === item.categoryId
      );
      //increase the count
      categoriesArray[categoryIndex]["readCount"] =
        categoriesArray[categoryIndex]["readCount"] + item["count"];

      //also update the individual feeds inside every category
      if (categoriesArray[categoryIndex]["feeds"]) {
        //find the index by comparing the categoryId from every element in the readArray, against the category.id in the categoriesArray
        var feedIndex = categoriesArray[categoryIndex]["feeds"].findIndex(
          feed => feed.id === item.feedId
        );
        //overwrite the count property
        categoriesArray[categoryIndex]["feeds"][feedIndex]["readCount"] =
          item["count"];
      }
    });

    //repeat for the unread
    await unreadArray.forEach(item => {
      var categoryIndex = categoriesArray.findIndex(
        category => category.id === item.categoryId
      );
      categoriesArray[categoryIndex]["unreadCount"] =
        categoriesArray[categoryIndex]["unreadCount"] + item["count"];

      if (categoriesArray[categoryIndex]["feeds"]) {
        var feedIndex = categoriesArray[categoryIndex]["feeds"].findIndex(
          feed => feed.id === item.feedId
        );
        categoriesArray[categoryIndex]["feeds"][feedIndex]["unreadCount"] =
          item["count"];
      }
    });

    //repeat for the star
    await starArray.forEach(item => {
      var categoryIndex = categoriesArray.findIndex(
        category => category.id === item.categoryId
      );

      categoriesArray[categoryIndex]["starCount"] =
        categoriesArray[categoryIndex]["starCount"] + item["count"];

      if (categoriesArray[categoryIndex]["feeds"]) {
        var feedIndex = categoriesArray[categoryIndex]["feeds"].findIndex(
          feed => feed.id === item.feedId
        );
        categoriesArray[categoryIndex]["feeds"][feedIndex]["starCount"] =
          item["count"];
      }
    });

    return res.status(200).json({
      total: totalCount,
      readCount: readCount,
      unreadCount: unreadCount,
      starCount: starCount,
      hotCount: hotCount,
      categories: categoriesArray
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

export const articleDetails = async (req, res, next) => {
  try {
    const articleIds = req.body.articleIds;
    const sort = req.body.sort;

    if (articleIds === undefined) {
      return res.status(404).json({
        message: "articleIds is not set"
      });
    }

    var articlesArray = articleIds.split(",");

    const articles = await Article.findAll({
      include: [
        {
          model: Feed,
          required: true
        }],
      order: [
        ["published", sort]
      ],
      where: {
        id: articlesArray
      }
    });

    if (!articles) {
      return res.status(404).json({
        message: "No articles found"
      });
    } else {
      res.status(200).json(articles);
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

export const articleMarkToRead = async (req, res, next) => {
  try {
    const articleId = req.params.articleId;
    const article = await Article.findByPk(articleId, {
      include: [{
        model: Feed,
        required: true
      }]
    });
    if (!article) {
      return res.status(404).json({
        message: "Article not found"
      });
    } else {
      article
        .update({
          status: "read"
        })
        .then(() => res.status(200).json(article))
        .catch(error => res.status(400).json(error));
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

export const articleMarkToUnread = async (req, res, next) => {
  try {
    const articleId = req.params.articleId;
    const article = await Article.findByPk(articleId, {
      include: [{
        model: Feed,
        required: true
      }]
    });
    if (!article) {
      return res.status(404).json({
        message: "Article not found"
      });
    } else {
      article
        .update({
          status: "unread"
        })
        .then(() => res.status(200).json(article))
        .catch(error => res.status(400).json(error));
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

export const articleMarkWithStar = async (req, res, next) => {
  try {
    const articleId = req.params.articleId;
    const update = req.body.update;
    const article = await Article.findByPk(articleId, {
      include: [{
        model: Feed,
        required: true
      }]
    });

    if (update === undefined) {
      return res.status(404).json({
        message: "Star indicator is not set"
      });
    }

    if (!article) {
      return res.status(404).json({
        message: "Article not found"
      });
    } else {
      if (update === "mark") {
        article
          .update({
            starInd: 1
          })
          .then(() => res.status(200).json(article))
          .catch(error => res.status(400).json(error));
      }

      if (update !== "mark") {
        article
          .update({
            starInd: 0
          })
          .then(() => res.status(200).json(article))
          .catch(error => res.status(400).json(error));
      }
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

export const articleMarkAllAsRead = async (req, res, next) => {
  try {
    await Article.update({
      status: "read"
    }, {
      where: {
        status: "unread"
      }
    });

    res.status(200).json("marked all as read");
  } catch (err) {
    console.log(err);
  }
};

export const categoryUpdateOrder = async (req, res, next) => {
  //categories are received in the preferred order
  const order = req.body.order;

  if (order === undefined) {
    return res.status(404).json({
      message: "order is not set"
    });
  }

  try {
    if (order.length > 0) {
      //start counting
      var count = 0;
      order.forEach(item => {
        Category.update({
          categoryOrder: count
        }, {
          where: {
            id: item
          }
        });
        //increase count
        count++;
      });
    }

    res.status(200).json("order updated");
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

export const feedChangeCategory = async (req, res, next) => {
  //categories are received in the preferred order
  const feedId = req.body.feedId;
  const categoryId = req.body.categoryId;

  if (feedId === undefined || categoryId === undefined) {
    return res.status(404).json({
      message: "feedId or categoryId is not set"
    });
  }

  try {
    const feed = await Feed.findByPk(feedId);
    const category = await Category.findByPk(categoryId);

    if (feed && category) {
      feed
        .update({
          categoryId: req.body.categoryId
        })
        .then(() => res.status(200).json(feed))
        .catch(error => res.status(400).json(error));
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

export default {
  getOverview,
  articleDetails,
  articleMarkToRead,
  articleMarkToUnread,
  articleMarkWithStar,
  articleMarkAllAsRead,
  categoryUpdateOrder,
  feedChangeCategory
}