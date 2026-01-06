import dotenv from 'dotenv';
import Setting from "../models/setting.js";

dotenv.config();

export const getSettings = async (req, res, next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    //set default values
    let categoryId = "%";
    let feedId = "%";
    let status = "unread";
    let sort = "DESC";
    let minAdvertisementScore = 0;
    let minSentimentScore = 0;
    let minQualityScore = 0;
    let viewMode = "full";
    let clusterView = false;

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
      clusterView = settings.clusterView || false;
    }

    //return all query params
    return res.status(200).json({
      userId: userId,
      categoryId: categoryId,
      feedId: feedId,
      sort: sort,
      status: status,
      search: null,
      minAdvertisementScore: minAdvertisementScore,
      minSentimentScore: minSentimentScore,
      minQualityScore: minQualityScore,
      viewMode: viewMode,
      clusterView: Boolean(clusterView),
      AIEnabled: Boolean(process.env.OPENAI_API_KEY)
    });
  } catch (err) {
    console.error('Error in getSettings:', err);
    return res.status(500).json({ error: err.message });
  }
};

export const setSettings = async (req, res, next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }
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

export default {
  getSettings,
  setSettings
}