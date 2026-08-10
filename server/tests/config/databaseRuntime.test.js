import { describe, expect, it, vi } from 'vitest';
import { resolveEffectiveCrawlConfiguration } from '../../config/databaseRuntime.js';

describe('resolveEffectiveCrawlConfiguration', () => {
  // Confirms MySQL retains configured crawl concurrency values.
  it('preserves configured MySQL values', () => {
    const result = resolveEffectiveCrawlConfiguration({
      dialect: 'mysql',
      environment: {
        CRAWL_PARALLELPROCESSFLAG: '1',
        CRAWL_USER_BATCH_SIZE: '4'
      }
    });

    expect(result).toEqual({ parallelProcessFlag: 1, userBatchSize: 4 });
  });

  // Confirms SQLite exposes only its supported sequential crawl settings.
  it('overrides unsafe SQLite values and warns clearly', () => {
    const logger = { warn: vi.fn() };
    const result = resolveEffectiveCrawlConfiguration({
      dialect: 'sqlite',
      environment: {
        CRAWL_PARALLELPROCESSFLAG: '1',
        CRAWL_USER_BATCH_SIZE: '4'
      },
      logger
    });

    expect(result).toEqual({ parallelProcessFlag: 0, userBatchSize: 1 });
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  // Confirms safe SQLite settings do not produce override warnings.
  it('does not warn when SQLite values are already safe', () => {
    const logger = { warn: vi.fn() };
    const result = resolveEffectiveCrawlConfiguration({
      dialect: 'sqlite',
      environment: {
        CRAWL_PARALLELPROCESSFLAG: '0',
        CRAWL_USER_BATCH_SIZE: '1'
      },
      logger
    });

    expect(result).toEqual({ parallelProcessFlag: 0, userBatchSize: 1 });
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
