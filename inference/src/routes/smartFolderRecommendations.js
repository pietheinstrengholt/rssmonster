import express from 'express';
import { getSmartFolderRecommendations } from '../smartFolderRecommendations/smartFolderRecommendationService.js';
import {
  canWriteInferenceResponse,
  createRequestCancellation,
  handleInferenceQueueError
} from '../middleware/requestCancellation.js';
import { getSafeErrorDetails } from '../debug.js';

export const createSmartFolderRecommendationsRouter = ({
  service = getSmartFolderRecommendations,
  logger = console
} = {}) => {
  const router = express.Router();
  router.post('/', async (req, res) => {
    const cancellation = createRequestCancellation(req, res);
    try {
      const result = await service(
        { insights: req.body?.insights || {} },
        { requestId: req.inferenceRequestId, signal: cancellation.signal }
      );
      if (!cancellation.isDisconnected() && canWriteInferenceResponse(req, res)) {
        res.status(200).json(result);
      }
    } catch (error) {
      if (handleInferenceQueueError(error, req, res)) return;
      logger.error(
        `[INFERENCE] Smart Folder recommendation failed requestId=${req.inferenceRequestId}:`,
        getSafeErrorDetails(error)
      );
      if (canWriteInferenceResponse(req, res)) {
        res.status(500).json({ error: 'Smart Folder recommendation failed' });
      }
    } finally {
      cancellation.cleanup();
    }
  });
  return router;
};

export default createSmartFolderRecommendationsRouter();
