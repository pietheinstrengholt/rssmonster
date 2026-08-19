import express from 'express';
import embeddingService, { EmbeddingValidationError } from '../embeddings/embeddingService.js';

export const createEmbeddingsRouter = ({
  service = embeddingService,
  logger = console
} = {}) => {
  const router = express.Router();

  router.get('/info', (_req, res) => {
    res.status(200).json(service.getInfo());
  });

  router.post('/', async (req, res) => {
    try {
      res.status(200).json(await service.embed(req.body?.texts));
    } catch (error) {
      if (error instanceof EmbeddingValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }

      logger.error('[INFERENCE] Embedding request failed:', error);
      res.status(500).json({ error: 'Embedding inference failed' });
    }
  });

  return router;
};

export default createEmbeddingsRouter();
