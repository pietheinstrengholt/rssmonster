import { AsyncLocalStorage } from 'node:async_hooks';

// One immutable override snapshot per crawl; never mutate process.env or share snapshots across runs.
const crawlSettings = new AsyncLocalStorage();
export const getCrawlOverrides = () => crawlSettings.getStore();
export const getCrawlEnvironment = () => ({ ...process.env, ...getCrawlOverrides() });
export const withCrawlConfiguration = (overrides, operation) =>
  crawlSettings.run(Object.freeze({ ...overrides }), operation);
