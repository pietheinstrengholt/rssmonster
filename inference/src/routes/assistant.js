import express from 'express';
import assistantModelService from '../assistant/assistantModelService.js';
import { logInferenceDebug } from '../debug.js';
import { createAssistantRateLimiter } from '../middleware/rateLimit.js';

export const createAssistantRouter = ({
  service = assistantModelService,
  logger = console,
  rateLimiter = createAssistantRateLimiter()
} = {}) => {
  const router = express.Router();

  router.post('/model', rateLimiter, async (req, res) => {
    try {
      res.status(200).json(await service.respond(req.body || {}));
    } catch (error) {
      logger.error('[INFERENCE] Assistant model request failed:', error);
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
      logger.error('[INFERENCE] Assistant streaming request failed:', error);
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
