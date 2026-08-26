import express from 'express';
import { rediscoverRssUrl } from '../feedRediscovery/feedRediscoveryService.js';
import {
  canWriteInferenceResponse,
  createRequestCancellation,
  handleInferenceQueueError
} from '../middleware/requestCancellation.js';
import { getSafeErrorDetails } from '../debug.js';

export const createFeedRediscoveryRouter = ({ service = rediscoverRssUrl, logger = console } = {}) => {
  const router = express.Router();
  router.post('/', async (req, res) => {
    const cancellation = createRequestCancellation(req, res);
    try {
      const result = await service(req.body || {}, {
        requestId: req.inferenceRequestId,
        signal: cancellation.signal
      });
      if (!cancellation.isDisconnected() && canWriteInferenceResponse(req, res)) {
        res.status(200).json(result);
      }
    } catch (error) {
      if (handleInferenceQueueError(error, req, res)) return;
      logger.error(
        `[INFERENCE] Feed rediscovery failed requestId=${req.inferenceRequestId}:`,
        getSafeErrorDetails(error)
      );
      if (canWriteInferenceResponse(req, res)) {
        res.status(500).json({ error: 'Feed rediscovery failed' });
      }
    } finally {
      cancellation.cleanup();
    }
  });
  return router;
};

export default createFeedRediscoveryRouter();
