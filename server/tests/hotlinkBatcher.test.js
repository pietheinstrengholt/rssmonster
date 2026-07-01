import { beforeEach, describe, expect, it, vi } from 'vitest';

const setMany = vi.fn(() => Promise.resolve());

vi.mock('../controllers/hotlink.js', () => ({
  default: { setMany }
}));

const { default: createHotlinkBatcher } = await import('../controllers/crawl/hotlinkBatcher.js');

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
