import Setting from "../models/setting.js";

export const getSettings = async (req, res, next) => {
  try {
    const userId = req.userData.userId;

    //set default values
    let categoryId = "%";
    let feedId = "%";
    let status = "unread";
    let sort = "DESC";

    const settings = await Setting.findOne({ where: { userId: userId }, raw: true });

    //use database values, if available
    if (settings) {
      categoryId = settings.categoryId;
      feedId = settings.feedId;
      status = settings.status;
      sort = settings.sort;
    }

    //return all query params
    return res.status(200).json({
      userId: userId,
      categoryId: categoryId,
      feedId: feedId,
      sort: sort,
      status: status,
      search: null
    });
  } catch (err) {
    console.error('Error in getSettings:', err);
    return res.status(500).json({ error: err.message });
  }
};

export default {
  getSettings
}