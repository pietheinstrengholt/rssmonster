import Setting from "../models/setting.js";

//the getArticles function returns an array with all the article ids
export const getSettings = async (req, res, next) => {
  try {
    //set default values
    var userId = req.userData.userId;
    var categoryId = "%";
    var feedId = "%";
    var status = "unread";
    var sort = "DESC";

    const settings = await Setting.findOne({ where: { userId: userId }, raw: true });

    //use database values, if available
    if (settings) userId = settings.userId;
    if (settings) categoryId = settings.categoryId;
    if (settings) feedId = settings.feedId;
    if (settings) status = settings.status;
    if (settings) sort = settings.sort;

    //return all query params and itemIds
    res.status(200).json({
      userId: userId,
      categoryId: categoryId,
      feedId: feedId,
      sort: sort,
      status: status,
      search: null
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

export default {
  getSettings
}