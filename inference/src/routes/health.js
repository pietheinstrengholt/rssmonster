import express from 'express';
import embeddingService from '../embeddings/embeddingService.js';

export const createHealthRouter = ({ service = embeddingService } = {}) => {
  const router = express.Router();

  router.get('/', (_req, res) => {
    res.status(200).json({ status: 'ok', modelLoaded: service.getInfo().loaded });
  });

  return router;
};

export default createHealthRouter();
