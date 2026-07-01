import { describe, expect, it } from 'vitest';
import crawlController from '../controllers/crawl.js';

describe('crawl interval controls', () => {
  it('allows feeds whose interval has elapsed', () => {
    const feed = {
      lastFetched: new Date('2026-07-01T00:00:00Z'),
      updateIntervalMinutes: 20
    };
    const now = new Date('2026-07-01T00:30:00Z');

    expect(crawlController.shouldCrawlFeed(feed, now)).toBe(true);
  });

  it('skips feeds whose interval has not elapsed', () => {
    const feed = {
      lastFetched: new Date('2026-07-01T00:00:00Z'),
      updateIntervalMinutes: 20
    };
    const now = new Date('2026-07-01T00:10:00Z');

    expect(crawlController.shouldCrawlFeed(feed, now)).toBe(false);
  });

  it('allows feeds without lastFetched or interval values', () => {
    expect(crawlController.shouldCrawlFeed({ lastFetched: null, updateIntervalMinutes: 60 })).toBe(true);
    expect(crawlController.shouldCrawlFeed({ lastFetched: new Date(), updateIntervalMinutes: null })).toBe(true);
  });

  it('skips feeds set to never crawl automatically', () => {
    const feed = {
      lastFetched: new Date('2026-07-01T00:00:00Z'),
      updateIntervalMinutes: 0
    };
    const now = new Date('2026-07-01T00:30:00Z');

    expect(crawlController.shouldCrawlFeed(feed, now)).toBe(false);
  });
});
