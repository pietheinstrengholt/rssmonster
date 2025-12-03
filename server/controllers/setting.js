import Setting from "../models/setting.js";

// Reusable function to retrieve settings data for a given userId
export const getSettingsForUser = async (userId) => {
  //set default values
  let categoryId = "%";
  let feedId = "%";
  let status = "unread";
  let sort = "DESC";
  let minAdvertisementScore = 0;
  let minSentimentScore = 0;
  let minQualityScore = 0;
  let viewMode = "full";

  const settings = await Setting.findOne({ where: { userId: userId }, raw: true });

  //use database values, if available
  if (settings) {
    categoryId = settings.categoryId;
    feedId = settings.feedId;
    status = settings.status;
    sort = settings.sort;
    minAdvertisementScore = settings.minAdvertisementScore || 100;
    minSentimentScore = settings.minSentimentScore || 100;
    minQualityScore = settings.minQualityScore || 100;
    viewMode = settings.viewMode || 'full';
  }

  //return all query params
  return {
    userId: userId,
    categoryId: categoryId,
    feedId: feedId,
    sort: sort,
    status: status,
    search: null,
    minAdvertisementScore: minAdvertisementScore,
    minSentimentScore: minSentimentScore,
    minQualityScore: minQualityScore,
    viewMode: viewMode
  };
};

// API handler wrapping the reusable function
export const getSettings = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    const data = await getSettingsForUser(userId);
    return res.status(200).json(data);
  } catch (err) {
    console.error('Error in getSettings:', err);
    return res.status(500).json({ error: err.message });
  }
};

export const setSettings = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    const { minAdvertisementScore, minSentimentScore, minQualityScore } = req.body;

    // Validate score values (0-100)
    const validateScore = (score, name) => {
      const numScore = parseInt(score);
      if (isNaN(numScore) || numScore < 0 || numScore > 100) {
        throw new Error(`${name} must be between 0 and 100`);
      }
      return numScore;
    };

    const validatedScores = {
      minAdvertisementScore: validateScore(minAdvertisementScore, 'minAdvertisementScore'),
      minSentimentScore: validateScore(minSentimentScore, 'minSentimentScore'),
      minQualityScore: validateScore(minQualityScore, 'minQualityScore')
    };

    // Find or create settings for user
    let settings = await Setting.findOne({ where: { userId: userId } });

    if (settings) {
      console.log("Updating existing settings for user:", userId);
      console.log("Validated validatedScores:", validatedScores);
      // Update existing settings
      await settings.update(validatedScores);
    } else {
      // Create new settings
      await Setting.create({
        userId: userId,
        ...validatedScores
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Settings saved successfully',
      ...validatedScores
    });
  } catch (err) {
    console.error('Error in setSettings:', err);
    return res.status(400).json({ error: err.message });
  }
};

// Reusable function to update settings for a given userId
export const updateSettings = async (userId, settingsData) => {
  const {
    categoryId,
    feedId,
    status,
    sort,
    minAdvertisementScore,
    minSentimentScore,
    minQualityScore,
    viewMode
  } = settingsData;

  const existingSettings = await Setting.findOne({ where: { userId: userId }, raw: true });
  
  if (existingSettings) {
    await Setting.update({
      categoryId: categoryId,
      feedId: feedId,
      status: status,
      sort: sort,
      minAdvertisementScore: minAdvertisementScore,
      minSentimentScore: minSentimentScore,
      minQualityScore: minQualityScore,
      viewMode: viewMode
    }, {
      where: { userId: userId }
    });
  } else {
    await Setting.create({
      userId: userId,
      categoryId: categoryId,
      feedId: feedId,
      status: status,
      sort: sort,
      minAdvertisementScore: minAdvertisementScore,
      minSentimentScore: minSentimentScore,
      minQualityScore: minQualityScore,
      viewMode: viewMode
    });
  }
};

export default {
  getSettings,
  setSettings,
  updateSettings
}