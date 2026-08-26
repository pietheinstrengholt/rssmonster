import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../services/inference/inferenceClient.js', () => ({
  requestInferenceJson: mocked.request
}));

const { rediscoverRssUrl } = await import('../../services/feeds/rediscoverRssUrl.js');

describe('rediscoverRssUrl', () => {
  beforeEach(() => mocked.request.mockReset());

  it('delegates feed metadata to inference', async () => {
    const input = {
      feedName: 'Publisher',
      websiteUrl: 'https://example.com',
      oldRssUrl: 'https://example.com/old.xml'
    };
    const result = { url: 'https://example.com/feed.xml', confidence: 0.9, reason: 'Official' };
    mocked.request.mockResolvedValue(result);
    await expect(rediscoverRssUrl(input)).resolves.toBe(result);
    expect(mocked.request).toHaveBeenCalledWith('/api/feed-rediscovery', input, {
      circuitKey: 'feed-rediscovery'
    });
  });
});
