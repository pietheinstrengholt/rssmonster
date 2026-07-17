import { beforeEach, describe, expect, it, vi } from 'vitest';

const setMany = vi.fn(() => Promise.resolve());

vi.mock('../../controllers/hotlink.js', () => ({
  default: { setMany }
}));

const { default: createHotlinkBatcher } = await import('../../services/crawl/runtime/hotlinkBatcher.js');

const feed = { id: 10, userId: 20 };

describe('hotlink batcher', () => {
  beforeEach(() => {
    setMany.mockClear();
  });

  it('writes unique queued URLs once when flushed', async () => {
    const batcher = createHotlinkBatcher(feed);
    batcher.add([
      'https://example.com/one',
      'https://example.com/two',
      'https://example.com/one'
    ]);

    await batcher.flush();

    expect(setMany).toHaveBeenCalledTimes(1);
    expect(setMany).toHaveBeenCalledWith(
      ['https://example.com/one', 'https://example.com/two'],
      feed.id,
      feed.userId
    );
  });

  it('flushes periodically once the queue reaches its threshold', async () => {
    const batcher = createHotlinkBatcher(feed, { flushThreshold: 2 });
    batcher.add(['https://example.com/one', 'https://example.com/two']);

    await batcher.flush();

    expect(setMany).toHaveBeenCalledTimes(1);
  });

  it('drains URLs queued while an earlier flush is still running', async () => {
    let resolveFirstWrite;
    const firstWrite = new Promise(resolve => {
      resolveFirstWrite = resolve;
    });
    setMany
      .mockImplementationOnce(() => firstWrite)
      .mockResolvedValueOnce();
    const batcher = createHotlinkBatcher(feed, { flushThreshold: 2 });

    batcher.add(['https://example.com/one', 'https://example.com/two']);
    batcher.add(['https://example.com/three', 'https://example.com/four']);
    const finalFlush = batcher.flush();

    expect(setMany).toHaveBeenCalledTimes(1);
    resolveFirstWrite();
    await finalFlush;

    expect(setMany).toHaveBeenCalledTimes(2);
    expect(setMany).toHaveBeenNthCalledWith(
      2,
      ['https://example.com/three', 'https://example.com/four'],
      feed.id,
      feed.userId
    );
  });

  it('keeps hotlink write failures best-effort', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    setMany.mockRejectedValueOnce(new Error('database unavailable'));
    const batcher = createHotlinkBatcher(feed);
    batcher.add(['https://example.com/one']);

    await expect(batcher.flush()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      `Error saving hotlink batch for feed ${feed.id}:`,
      expect.any(Error)
    );
    consoleError.mockRestore();
  });
});
