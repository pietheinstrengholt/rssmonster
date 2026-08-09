import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import processArticle from '../../services/crawl/orchestration/processArticle.js';
import {
  assertNormalizedFeedLimits
} from '../../services/feeds/feedsmith/feedInputLimits.js';
import {
  parseFeedSourceIsolated
} from '../../services/feeds/feedsmith/isolatedFeedParser.js';
import {
  createHttpBodyStream,
  createHttpResponse
} from '../../services/feeds/http/contracts.js';
import { readResponseText } from '../../services/feeds/http/responseBody.js';

const originalMaxEntries = process.env.FEED_MAX_ENTRIES;

// Restores parser limit configuration changed by hostile-input tests.
afterEach(() => {
  if (originalMaxEntries === undefined) delete process.env.FEED_MAX_ENTRIES;
  else process.env.FEED_MAX_ENTRIES = originalMaxEntries;
  vi.restoreAllMocks();
});

describe('hard feed execution bounds', () => {
  it('cancels a body read that never produces another chunk', async () => {
    const cancel = vi.fn();
    const response = createHttpResponse({
      status: 200,
      url: 'https://slow.example/feed.xml',
      body: createHttpBodyStream({
        read: () => new Promise(() => {}),
        cancel
      })
    });

    const result = await readResponseText(response, {
      deadlineAt: Date.now() + 30
    });

    expect(result.error).toMatchObject({ type: 'timed_out' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('terminates a CPU-bound parser worker before rejecting', async () => {
    const hangWorkerUrl = new URL(
      '../fixtures/feedParserHangWorker.js',
      import.meta.url
    );
    const startedAt = Date.now();

    await expect(parseFeedSourceIsolated('<rss/>', {
      workerUrl: hangWorkerUrl,
      parserTimeoutMs: 50,
      deadlineAt: Date.now() + 1000,
      parserMemoryMb: 16
    })).rejects.toMatchObject({
      name: 'TimeoutError',
      code: 'FEED_EXECUTION_TIMEOUT'
    });
    expect(Date.now() - startedAt).toBeLessThan(1000);

    await expect(parseFeedSourceIsolated(
      '<rss version="2.0"><channel><title>Healthy</title></channel></rss>',
      { deadlineAt: Date.now() + 1000 }
    )).resolves.toMatchObject({ title: 'Healthy' });
  });

  it.each([
    'externalEntityFeed.xml',
    'entityExpansionFeed.xml'
  ])('rejects hostile XML declaration fixture %s before worker parsing', async fixture => {
    const source = await readFile(
      new URL(`../fixtures/${fixture}`, import.meta.url),
      'utf8'
    );

    await expect(parseFeedSourceIsolated(source, {
      deadlineAt: Date.now() + 1000
    })).rejects.toMatchObject({ code: 'UNSAFE_FEED_XML' });
  });

  it('rejects excessive entry counts inside the parser isolate', async () => {
    process.env.FEED_MAX_ENTRIES = '2';
    const items = [1, 2, 3]
      .map(index => `<item><title>${index}</title></item>`)
      .join('');

    await expect(parseFeedSourceIsolated(
      `<rss version="2.0"><channel><title>Many</title>${items}</channel></rss>`,
      { deadlineAt: Date.now() + 1000 }
    )).rejects.toMatchObject({
      code: 'FEED_INPUT_LIMIT_EXCEEDED',
      field: 'entry count'
    });
  });

  it.each([
    ['externalId', 'guidBytes'],
    ['url', 'urlBytes'],
    ['title', 'titleBytes'],
    ['author', 'authorBytes']
  ])('rejects oversized %s values before enrichment', (field, limitField) => {
    const limits = {
      entries: 10,
      guidBytes: 4,
      urlBytes: 4,
      titleBytes: 4,
      authorBytes: 4,
      contentBytes: 20
    };

    expect(() => assertNormalizedFeedLimits({
      entries: [{ [field]: '12345' }]
    }, limits)).toThrow(expect.objectContaining({
      code: 'FEED_INPUT_LIMIT_EXCEEDED',
      field,
      limit: limits[limitField]
    }));
  });

  it('rejects oversized combined content before enrichment', () => {
    expect(() => assertNormalizedFeedLimits({
      entries: [{ content: '123456', description: '123456' }]
    }, {
      entries: 10,
      guidBytes: 10,
      urlBytes: 10,
      titleBytes: 10,
      authorBytes: 10,
      contentBytes: 10
    })).toThrow(expect.objectContaining({
      code: 'FEED_INPUT_LIMIT_EXCEEDED',
      field: 'content'
    }));
  });

  it('discards optional feed metadata that exceeds Feed schema limits', () => {
    const normalized = assertNormalizedFeedLimits({
      title: 't'.repeat(256),
      description: 'd'.repeat(65_536),
      faviconUrl: `https://example.test/${'i'.repeat(240)}`,
      selfUrl: `https://example.test/${'s'.repeat(8192)}`,
      entries: []
    });

    expect(normalized).toMatchObject({
      title: null,
      description: null,
      faviconUrl: null,
      selfUrl: null,
      entries: []
    });
  });

  it('prevents article database work after the absolute deadline', async () => {
    const findSpy = vi.spyOn(db.Article, 'findOne');
    const createSpy = vi.spyOn(db.Article, 'create');

    await expect(processArticle(
      { id: 1, userId: 1 },
      {},
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      { deadlineAt: Date.now() - 1 }
    )).rejects.toMatchObject({ code: 'FEED_EXECUTION_TIMEOUT' });
    expect(findSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });
});
