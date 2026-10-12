import express from 'express';
import articleClassificationService from '../classifications/articleClassificationService.js';
import {
  canWriteInferenceResponse,
  createRequestCancellation,
  handleInferenceQueueError
} from '../middleware/requestCancellation.js';

export const createClassificationsRouter = ({ service = articleClassificationService } = {}) => {
  const router = express.Router();
  router.post('/article', async (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ error: 'request body is required' });
      return;
    }
    const cancellation = createRequestCancellation(req, res);
    try {
      const result = await service(req.body, {
        requestId: req.inferenceRequestId,
        signal: cancellation.signal
      });
      if (!cancellation.isDisconnected() && canWriteInferenceResponse(req, res)) {
        res.status(200).json(result);
      }
    } catch (error) {
      if (handleInferenceQueueError(error, req, res)) return;
      if (canWriteInferenceResponse(req, res)) throw error;
    } finally {
      cancellation.cleanup();
    }
  });
  return router;
};

export default createClassificationsRouter();
