import { CrawlConfigurationError, getCrawlSettings, saveCrawlSettings, clearCrawlSettings } from '../services/crawl/configuration.js';
const action = operation => async (req, res) => {
  try { res.json(await operation(req)); } catch (error) {
    res.status(error instanceof CrawlConfigurationError ? 400 : 503).json({ error: error instanceof CrawlConfigurationError ? error.message : 'Crawl settings are unavailable' });
  }
};
export const get = action(() => getCrawlSettings());
export const put = action(req => saveCrawlSettings(req.body));
export const clear = action(() => clearCrawlSettings());
