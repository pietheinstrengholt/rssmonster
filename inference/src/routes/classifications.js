import express from 'express';
import articleClassificationService from '../classifications/articleClassificationService.js';

export const createClassificationsRouter = ({ service = articleClassificationService } = {}) => {
  const router = express.Router();
  router.post('/article', async (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ error: 'request body is required' });
      return;
    }
    res.status(200).json(await service(req.body));
  });
  return router;
};

export default createClassificationsRouter();
