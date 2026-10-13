import express from 'express';
import { createAssistantAgentService } from '../assistant/assistantAgentService.js';
import { createRequestCancellation, canWriteInferenceResponse } from '../middleware/requestCancellation.js';
import assistantModelService from '../assistant/assistantModelService.js';
import { getSafeErrorDetails, logInferenceDebug } from '../debug.js';
import { createAssistantRateLimiter } from '../middleware/rateLimit.js';

export const createAssistantRouter = ({
  service = assistantModelService,
  agentService = createAssistantAgentService(),
  logger = console,
  rateLimiter = createAssistantRateLimiter()
} = {}) => {
  const router = express.Router();

  router.post('/run/stream', rateLimiter, async (req, res) => {
    const cancellation = createRequestCancellation(req, res);
    try {
      const stream = agentService.stream(req.body || {}, { signal: cancellation.signal });
      const first = await stream.next();
      if (!canWriteInferenceResponse(req, res)) return;
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.flushHeaders?.();
      if (!first.done) res.write(`${JSON.stringify(first.value)}\n`);
      for await (const event of stream) {
        if (!canWriteInferenceResponse(req, res)) break;
        res.write(`${JSON.stringify(event)}\n`);
      }
      res.end();
    } catch (error) {
      if (!canWriteInferenceResponse(req, res)) return;
      logger.error(`[INFERENCE] Assistant run failed requestId=${req.inferenceRequestId}:`, getSafeErrorDetails(error));
      if (!res.headersSent) res.status(500).json({ error: 'Assistant inference failed' });
      else {
        res.write(`${JSON.stringify({ type: 'error', error: 'Assistant inference failed' })}\n`);
        res.end();
      }
    } finally {
      cancellation.cleanup();
    }
  });

  router.post('/model', rateLimiter, async (req, res) => {
    try {
      res.status(200).json(await service.respond(req.body || {}));
    } catch (error) {
      logger.error(
        `[INFERENCE] Assistant model request failed requestId=${req.inferenceRequestId}:`,
        getSafeErrorDetails(error)
      );
      res.status(500).json({ error: 'Assistant inference failed' });
    }
  });

  router.post('/model/stream', rateLimiter, async (req, res) => {
    const startedAt = Date.now();
    try {
      const stream = await service.stream(req.body || {});
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.flushHeaders?.();
      for await (const event of stream) {
        res.write(`${JSON.stringify(event)}\n`);
      }
      res.end();
      logInferenceDebug(`completed assistant-stream durationMs=${Date.now() - startedAt}`, { logger });
    } catch (error) {
      logger.error(
        `[INFERENCE] Assistant streaming request failed requestId=${req.inferenceRequestId}:`,
        getSafeErrorDetails(error)
      );
      if (!res.headersSent) {
        res.status(500).json({ error: 'Assistant inference failed' });
      } else {
        res.destroy(error);
      }
    }
  });

  return router;
};

export default createAssistantRouter();
