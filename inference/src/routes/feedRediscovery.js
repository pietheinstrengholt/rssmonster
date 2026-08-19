import express from 'express';
import { rediscoverRssUrl } from '../feedRediscovery/feedRediscoveryService.js';

export const createFeedRediscoveryRouter = ({ service = rediscoverRssUrl, logger = console } = {}) => {
  const router = express.Router();
  router.post('/', async (req, res) => {
    try {
      res.status(200).json(await service(req.body || {}));
    } catch (error) {
      logger.error('[INFERENCE] Feed rediscovery failed:', error);
      res.status(500).json({ error: 'Feed rediscovery failed' });
    }
  });
  return router;
};

export default createFeedRediscoveryRouter();
