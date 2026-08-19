import express from 'express';
import { getSmartFolderRecommendations } from '../smartFolderRecommendations/smartFolderRecommendationService.js';

export const createSmartFolderRecommendationsRouter = ({
  service = getSmartFolderRecommendations,
  logger = console
} = {}) => {
  const router = express.Router();
  router.post('/', async (req, res) => {
    try {
      res.status(200).json(await service({ insights: req.body?.insights || {} }));
    } catch (error) {
      logger.error('[INFERENCE] Smart Folder recommendation failed:', error);
      res.status(500).json({ error: 'Smart Folder recommendation failed' });
    }
  });
  return router;
};

export default createSmartFolderRecommendationsRouter();
