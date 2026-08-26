import express from 'express';
import { createEmbeddingService } from './embeddings/embeddingService.js';
import { createEmbeddingProvider } from './embeddings/providers/index.js';
import { createEmbeddingsRouter } from './routes/embeddings.js';
import { createHealthRouter, createReadinessRouter } from './routes/health.js';
import { createAssistantRouter } from './routes/assistant.js';
import { createClassificationsRouter } from './routes/classifications.js';
import { createFeedRediscoveryRouter } from './routes/feedRediscovery.js';
import { createSmartFolderRecommendationsRouter } from './routes/smartFolderRecommendations.js';
import { createAssistantRateLimiter } from './middleware/rateLimit.js';
import { createRequestLifecycleMiddleware } from './middleware/requestLifecycle.js';
import { createReadinessGate } from './middleware/readinessGate.js';
import { createReadinessState } from './readiness/readinessState.js';
import { getSafeErrorDetails } from './debug.js';

export const handleAppError = (error, req, res, next, logger = console) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    res.status(400).json({ error: 'request body must contain valid JSON' });
    return;
  }

  if (error.type === 'entity.too.large') {
    res.status(413).json({ error: 'request body is too large' });
    return;
  }

  if (res.headersSent) {
    next(error);
    return;
  }

  logger.error(
    `[INFERENCE] Request failed requestId=${req.inferenceRequestId}:`,
    getSafeErrorDetails(error)
  );
  res.status(500).json({ error: 'Internal server error' });
};

export const createApp = ({
  provider,
  environment = process.env,
  logger = console,
  classificationService,
  assistantService,
  smartFolderRecommendationService,
  feedRediscoveryService,
  readinessState
} = {}) => {
  const app = express();
  const readiness = readinessState || createReadinessState({ initialState: 'ready', logger });
  const embeddingService = createEmbeddingService({
    provider: provider || createEmbeddingProvider(environment),
    environment,
    logger
  });
  app.locals.embeddingService = embeddingService;
  app.locals.readiness = readiness;
  app.use(createRequestLifecycleMiddleware({ environment, logger }));

  const readinessGate = createReadinessGate({ readiness });
  app.use('/health', createHealthRouter({ readiness }));
  app.use('/ready', createReadinessRouter({ readiness }));

  const assistantRateLimiter = createAssistantRateLimiter({ environment });
  app.use('/api/assistant', readinessGate, express.json({ limit: '1mb' }), createAssistantRouter({
    service: assistantService,
    logger,
    rateLimiter: assistantRateLimiter
  }));
  app.use('/api', readinessGate);
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/embeddings', createEmbeddingsRouter({ service: embeddingService, logger }));
  app.use('/api/classifications', createClassificationsRouter({ service: classificationService }));
  app.use('/api/smart-folder-recommendations', createSmartFolderRecommendationsRouter({
    service: smartFolderRecommendationService,
    logger
  }));
  app.use('/api/feed-rediscovery', createFeedRediscoveryRouter({
    service: feedRediscoveryService,
    logger
  }));

  app.use((error, req, res, next) => handleAppError(error, req, res, next, logger));

  return app;
};

export const readinessState = createReadinessState();

export default createApp({ readinessState });
