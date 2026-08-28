import express from 'express';
import {
  generateSemanticLabels,
  SemanticLabelInputError
} from '../semanticLabels/semanticLabelService.js';
import {
  canWriteInferenceResponse,
  createRequestCancellation,
  handleInferenceQueueError
} from '../middleware/requestCancellation.js';
import { getSafeErrorDetails } from '../debug.js';

export const createSemanticLabelsRouter = ({
  service = generateSemanticLabels,
  logger = console
} = {}) => {
  const router = express.Router();

  router.post('/', async (req, res) => {
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
      if (error instanceof SemanticLabelInputError) {
        if (canWriteInferenceResponse(req, res)) {
          res.status(400).json({ error: error.message });
        }
        return;
      }
      logger.error(
        `[INFERENCE] Semantic labeling failed requestId=${req.inferenceRequestId}:`,
        getSafeErrorDetails(error)
      );
      if (canWriteInferenceResponse(req, res)) {
        res.status(500).json({ error: 'Semantic labeling failed' });
      }
    } finally {
      cancellation.cleanup();
    }
  });

  return router;
};

export default createSemanticLabelsRouter;
