import express from 'express';
import { createEmbeddingService } from './embeddings/embeddingService.js';
import { createEmbeddingProvider } from './embeddings/providers/index.js';
import { createEmbeddingsRouter } from './routes/embeddings.js';
import { createHealthRouter } from './routes/health.js';
import { createAssistantRouter } from './routes/assistant.js';
import { createClassificationsRouter } from './routes/classifications.js';
import { createFeedRediscoveryRouter } from './routes/feedRediscovery.js';
import { createSmartFolderRecommendationsRouter } from './routes/smartFolderRecommendations.js';

export const createApp = ({
  provider,
  environment = process.env,
  logger = console,
  classificationService,
  assistantService,
  smartFolderRecommendationService,
  feedRediscoveryService
} = {}) => {
  const app = express();
  const embeddingService = createEmbeddingService({
    provider: provider || createEmbeddingProvider(environment),
    environment,
    logger
  });
  app.locals.embeddingService = embeddingService;

  app.use('/api/assistant', express.json({ limit: '1mb' }), createAssistantRouter({
    service: assistantService,
    logger
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/health', createHealthRouter({ service: embeddingService }));
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

  app.use((error, _req, res, next) => {
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

    logger.error('[INFERENCE] Request failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};

export default createApp();
