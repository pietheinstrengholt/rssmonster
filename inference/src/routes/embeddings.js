import express from 'express';
import embeddingService, { EmbeddingValidationError } from '../embeddings/embeddingService.js';
import { getSafeErrorDetails } from '../debug.js';
import {
  canWriteInferenceResponse,
  createRequestCancellation,
  handleInferenceQueueError
} from '../middleware/requestCancellation.js';

export const createEmbeddingsRouter = ({
  service = embeddingService,
  logger = console
} = {}) => {
  const router = express.Router();

  router.get('/info', (_req, res) => {
    res.status(200).json(service.getInfo());
  });

  router.post('/', async (req, res) => {
    const cancellation = createRequestCancellation(req, res);
    try {
      const result = await service.embed(req.body?.texts, {
        requestId: req.inferenceRequestId,
        signal: cancellation.signal,
        operation: 'embeddings'
      });
      if (!cancellation.isDisconnected() && canWriteInferenceResponse(req, res)) {
        res.status(200).json(result);
      }
    } catch (error) {
      if (error instanceof EmbeddingValidationError) {
        if (canWriteInferenceResponse(req, res)) {
          res.status(400).json({ error: error.message });
        }
        return;
      }
      if (handleInferenceQueueError(error, req, res)) return;

      logger.error(
        `[INFERENCE] Embedding request failed requestId=${req.inferenceRequestId}:`,
        getSafeErrorDetails(error)
      );
      if (canWriteInferenceResponse(req, res)) {
        res.status(500).json({ error: 'Embedding inference failed' });
      }
    } finally {
      cancellation.cleanup();
    }
  });

  return router;
};

export default createEmbeddingsRouter();
