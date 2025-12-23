import Article from "../models/article.js";
import Category from "../models/category.js";
import Feed from "../models/feed.js";
import Setting from "../models/setting.js";

import cache from '../util/cache.js';

import Sequelize from "sequelize";
import { Op } from 'sequelize';

export const getOverview = async (req, res, next) => {
  const userId = req.userData.userId;
  try {
    // Get user settings for score filters
    const settings = await Setting.findOne({ 
      where: { userId: userId },
      attributes: ['minAdvertisementScore', 'minSentimentScore', 'minQualityScore']
    });

    // Use settings or default to 100
    const minAdvertisementScore = settings?.minAdvertisementScore || 100;
    const minSentimentScore = settings?.minSentimentScore || 100;
    const minQualityScore = settings?.minQualityScore || 100;

    // Merge all counts into a single SQL statement
    const baseWhere = {
      userId: userId,
      advertisementScore: { [Op.lte]: minAdvertisementScore },
      sentimentScore: { [Op.lte]: minSentimentScore },
      qualityScore: { [Op.lte]: minQualityScore }
    };

    // Build hotCount SQL for URLs
    const hotUrls = cache.all();
    const hotSql = hotUrls.length > 0
      ? `CASE WHEN url IN (${hotUrls.map(url => `'${url.replace(/'/g, "''")}'`).join(',')}) THEN 1 END`
      : `NULL`;

    const counts = await Article.findOne({
      where: baseWhere,
      attributes: [
        [Sequelize.literal("COUNT(CASE WHEN status = 'unread' THEN 1 END)"), 'unreadCount'],
        [Sequelize.literal("COUNT(CASE WHEN status = 'read' THEN 1 END)"), 'readCount'],
        [Sequelize.literal("COUNT(CASE WHEN starInd = 1 THEN 1 END)"), 'starCount'],
        [Sequelize.literal("COUNT(CASE WHEN clickedInd = 1 THEN 1 END)"), 'clickedCount'],
        [Sequelize.literal(`COUNT(${hotSql})`), 'hotCount']
      ],
      raw: true
    });

    // Parse counts safely
    const unreadCount = parseInt(counts.unreadCount) || 0;
    const readCount = parseInt(counts.readCount) || 0;
    const starCount = parseInt(counts.starCount) || 0;
    const clickedCount = parseInt(counts.clickedCount) || 0;
    const hotCount = parseInt(counts.hotCount) || 0;
    const totalCount = readCount + unreadCount;

    // Fetch categories with nested feeds
    const categories = await Category.findAll({
      where: {
        userId: userId
      },
      include: [{
        userId: userId,
        model: Feed,
        required: false
      }],
      order: ["categoryOrder", "name"]
    });

    // Combine all grouped counts into a single SQL query
    const countsGrouped = await Feed.findAll({
      include: [{
        model: Article,
        attributes: [],
        where: baseWhere
      }],
      attributes: [
        'categoryId',
        ['id', 'feedId'],
        [Sequelize.literal("COUNT(CASE WHEN `articles`.`status` = 'unread' THEN 1 END)"), 'unreadCount'],
        [Sequelize.literal("COUNT(CASE WHEN `articles`.`status` = 'read' THEN 1 END)"), 'readCount'],
        [Sequelize.literal("COUNT(CASE WHEN `articles`.`starInd` = 1 THEN 1 END)"), 'starCount'],
        [Sequelize.literal("COUNT(CASE WHEN `articles`.`clickedInd` = 1 THEN 1 END)"), 'clickedCount']
      ],
      order: ['id'],
      group: ['feeds.categoryId', 'feeds.id'],
      raw: true
    });

    // Convert countsGrouped to nested structure: category[categoryId].feed[feedId]
    const countsNested = {};
    countsGrouped.forEach(item => {
      // Initialize category if it doesn't exist
      if (!countsNested[item.categoryId]) {
        countsNested[item.categoryId] = { feeds: {} };
      }
      
      // Add feed data under category
      countsNested[item.categoryId].feeds[item.feedId] = {
        unreadCount: parseInt(item.unreadCount) || 0,
        readCount: parseInt(item.readCount) || 0,
        starCount: parseInt(item.starCount) || 0,
        clickedCount: parseInt(item.clickedCount) || 0
      };
    });

    // Function to convert Sequelize instances to plain objects
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
    const categoriesArray = toPlain(categories);

    //give each category and feed in the categoriesArray a readCount, unreadCount and starCount
    categoriesArray.forEach(category => {
      category["readCount"] = 0;
      category["unreadCount"] = 0;
      category["starCount"] = 0;
      category["hotCount"] = 0;
      category["clickedCount"] = 0;
      if (category["feeds"]) {
        category["feeds"].forEach(feed => {
          feed["readCount"] = 0;
          feed["unreadCount"] = 0;
          feed["starCount"] = 0;
          feed["hotCount"] = 0;
          feed["clickedCount"] = 0;
        });
      }
    });

    //Iterate over countsNested object to populate categoriesArray with counts
    Object.keys(countsNested).forEach(categoryId => {
      //find the index by comparing the categoryId against the category.id in the categoriesArray
      const categoryIndex = categoriesArray.findIndex(
        category => category.id === parseInt(categoryId)
      );

      if (categoryIndex === -1) return;

      //also update the individual feeds inside every category
      if (categoriesArray[categoryIndex]["feeds"]) {
        Object.keys(countsNested[categoryId].feeds).forEach(feedId => {
          //find the feed index
          const feedIndex = categoriesArray[categoryIndex]["feeds"].findIndex(
            feed => feed.id === parseInt(feedId)
          );
          
          if (feedIndex === -1) return;
          
          const feedCounts = countsNested[categoryId].feeds[feedId];
          
          //increase the category counts
          categoriesArray[categoryIndex]["unreadCount"] += feedCounts.unreadCount;
          categoriesArray[categoryIndex]["readCount"] += feedCounts.readCount;
          categoriesArray[categoryIndex]["starCount"] += feedCounts.starCount;
          categoriesArray[categoryIndex]["clickedCount"] += feedCounts.clickedCount;
          
          //set the feed counts
          categoriesArray[categoryIndex]["feeds"][feedIndex]["unreadCount"] = feedCounts.unreadCount;
          categoriesArray[categoryIndex]["feeds"][feedIndex]["readCount"] = feedCounts.readCount;
          categoriesArray[categoryIndex]["feeds"][feedIndex]["starCount"] = feedCounts.starCount;
          categoriesArray[categoryIndex]["feeds"][feedIndex]["clickedCount"] = feedCounts.clickedCount;
        });
      }
    });

    // Return the final overview response
    return res.status(200).json({
      total: totalCount,
      readCount: readCount,
      unreadCount: unreadCount,
      starCount: starCount,
      hotCount: hotCount,
      clickedCount: clickedCount,
      categories: categoriesArray
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

export const categoryUpdateOrder = async (req, res, next) => {
  //categories are received in the preferred order
  const order = req.body.order;
  const userId = req.userData.userId;

  if (order === undefined) {
    return res.status(400).json({
      message: "order is not set"
    });
  }

  try {
    if (order.length > 0) {
      //start counting
      let count = 0;
      order.forEach(item => {
        Category.update({
          categoryOrder: count
        }, {
          where: {
            userId: userId,
            id: item
          }
        });
        //increase count
        count++;
      });
    }

    return res.status(200).json("order updated");
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

export const feedChangeCategory = async (req, res, next) => {
  //categories are received in the preferred order
  const feedId = req.body.feedId;
  const categoryId = req.body.categoryId;
  const userId = req.userData.userId;

  if (feedId === undefined || categoryId === undefined) {
    return res.status(400).json({
      message: "feedId or categoryId is not set"
    });
  }

  try {
    const feed = await Feed.findOne({
      where: {
        id: feedId,
        userId: userId
      }
    })

    const category = await Category.findOne({
      where: {
        id: categoryId,
        userId: userId
      }
    })

    if (!feed || !category) {
      return res.status(404).json({
        message: "Feed or category not found"
      });
    }

    if (feed && category) {
      feed
        .update({
          categoryId: req.body.categoryId
        }, { where: { userId: userId }})
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
  categoryUpdateOrder,
  feedChangeCategory
}