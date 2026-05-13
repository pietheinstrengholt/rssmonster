import db from '../models/index.js';
import { getInterestIslandDashboard } from '../util/interestIsland.service.js';

const { Setting } = db;

export const getSettings = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    let categoryId = '%';
    let feedId = '%';
    let status = 'unread';
    let sort = 'DESC';
    let minAdvertisementScore = 0;
    let minSentimentScore = 0;
    let minQualityScore = 0;
    let viewMode = 'full';
    let clusterView = 'all';

    const settings = await Setting.findOne({ where: { userId }, raw: true });

    if (settings) {
      categoryId = settings.categoryId;
      feedId = settings.feedId;
      status = settings.status;
      sort = settings.sort;
      minAdvertisementScore = settings.minAdvertisementScore || 0;
      minSentimentScore = settings.minSentimentScore || 0;
      minQualityScore = settings.minQualityScore || 0;
      viewMode = settings.viewMode || 'full';
      clusterView = settings.clusterView || 'all';
    }

    return res.status(200).json({
      userId,
      categoryId,
      feedId,
      sort,
      status,
      search: null,
      minAdvertisementScore,
      minSentimentScore,
      minQualityScore,
      viewMode,
      clusterView: String(clusterView),
      AIEnabled: Boolean(process.env.OPENAI_API_KEY)
    });
  } catch (err) {
    console.error('Error in getSettings:', err);
    return res.status(500).json({ error: err.message });
  }
};

export const setSettings = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const { minAdvertisementScore, minSentimentScore, minQualityScore } = req.body;

    const validateScore = (score, name) => {
      const numScore = parseInt(score, 10);
      if (Number.isNaN(numScore) || numScore < 0 || numScore > 100) {
        throw new Error(`${name} must be between 0 and 100`);
      }
      return numScore;
    };

    const validatedScores = {
      minAdvertisementScore: validateScore(minAdvertisementScore, 'minAdvertisementScore'),
      minSentimentScore: validateScore(minSentimentScore, 'minSentimentScore'),
      minQualityScore: validateScore(minQualityScore, 'minQualityScore')
    };

    const settings = await Setting.findOne({ where: { userId } });

    if (settings) {
      await settings.update(validatedScores);
    } else {
      await Setting.create({ userId, ...validatedScores });
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

export const getInterestIslands = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const dashboard = await getInterestIslandDashboard(userId);
    return res.status(200).json(dashboard);
  } catch (err) {
    console.error('Error in getInterestIslands:', err);
    return res.status(500).json({ error: err.message });
  }
};

export default {
  getSettings,
  setSettings,
  getInterestIslands
};