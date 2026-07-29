import { beforeEach, describe, expect, it, vi } from 'vitest';

const replaceMany = vi.fn(() => Promise.resolve());

vi.mock('../../controllers/hotlink.js', () => ({
  default: { replaceMany }
}));

const { default: createHotlinkBatcher } = await import('../../services/crawl/runtime/hotlinkBatcher.js');

const feed = { id: 10, userId: 20 };

describe('hotlink batcher', () => {
  beforeEach(() => {
    replaceMany.mockClear();
  });

  it('writes unique queued URLs once when flushed', async () => {
    const batcher = createHotlinkBatcher(feed);
    batcher.add([
      'https://example.com/one',
      'https://example.com/two',
      'https://example.com/one'
    ], 101);

    await batcher.flush();

    expect(replaceMany).toHaveBeenCalledTimes(1);
    expect(replaceMany).toHaveBeenCalledWith(
      [{
        sourceArticleId: 101,
        urls: ['https://example.com/one', 'https://example.com/two']
      }],
      feed.id,
      feed.userId
    );
  });

  it('flushes periodically once the queue reaches its threshold', async () => {
    const batcher = createHotlinkBatcher(feed, { flushThreshold: 2 });
    batcher.add(['https://example.com/one', 'https://example.com/two'], 101);

    await batcher.flush();

    expect(replaceMany).toHaveBeenCalledTimes(1);
  });

  it('flushes an empty replacement when an article removes all links', async () => {
    const batcher = createHotlinkBatcher(feed);
    batcher.add([], 101);

    await batcher.flush();

    expect(replaceMany).toHaveBeenCalledWith([
      {
        sourceArticleId: 101,
        urls: []
      }
    ], feed.id, feed.userId);
  });

  it('drains URLs queued while an earlier flush is still running', async () => {
    let resolveFirstWrite;
    const firstWrite = new Promise(resolve => {
      resolveFirstWrite = resolve;
    });
    replaceMany
      .mockImplementationOnce(() => firstWrite)
      .mockResolvedValueOnce();
    const batcher = createHotlinkBatcher(feed, { flushThreshold: 2 });

    batcher.add(['https://example.com/one', 'https://example.com/two'], 101);
    batcher.add(['https://example.com/three', 'https://example.com/four'], 102);
    const finalFlush = batcher.flush();

    expect(replaceMany).toHaveBeenCalledTimes(1);
    resolveFirstWrite();
    await finalFlush;

    expect(replaceMany).toHaveBeenCalledTimes(2);
    expect(replaceMany).toHaveBeenNthCalledWith(
      2,
      [{
        sourceArticleId: 102,
        urls: ['https://example.com/three', 'https://example.com/four']
      }],
      feed.id,
      feed.userId
    );
  });

  it('keeps hotlink write failures best-effort', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    replaceMany.mockRejectedValueOnce(new Error('database unavailable'));
    const batcher = createHotlinkBatcher(feed);
    batcher.add(['https://example.com/one'], 101);

    await expect(batcher.flush()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      `Error saving hotlink batch for feed ${feed.id}:`,
      expect.any(Error)
    );
    consoleError.mockRestore();
  });
});
