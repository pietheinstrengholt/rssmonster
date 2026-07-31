import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  createCompletion: vi.fn()
}));

vi.mock('openai', () => ({
  default: class OpenAI {
    // This constructor exposes the mocked chat completion API to the service.
    constructor() {
      this.chat = {
        completions: {
          create: mocked.createCompletion
        }
      };
    }
  }
}));

const originalApiKey = process.env.OPENAI_API_KEY;

describe('rediscoverRssUrl', () => {
  beforeEach(() => {
    vi.resetModules();
    mocked.createCompletion.mockReset();
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it('rejects requests when OpenAI is not configured', async () => {
    const { rediscoverRssUrl } = await import(
      '../../services/feeds/rediscoverRssUrl.js'
    );

    await expect(rediscoverRssUrl({
      feedName: 'Publisher',
      websiteUrl: 'https://example.com',
      oldRssUrl: 'https://example.com/old.xml'
    })).rejects.toThrow('OpenAI API key not configured');
    expect(mocked.createCompletion).not.toHaveBeenCalled();
  });

  it('returns the strict JSON replacement suggested by OpenAI', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    mocked.createCompletion.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            url: 'https://example.com/feed.xml',
            confidence: 0.9,
            reason: 'This is the publisher’s current official feed.'
          })
        }
      }]
    });
    const { rediscoverRssUrl } = await import(
      '../../services/feeds/rediscoverRssUrl.js'
    );

    await expect(rediscoverRssUrl({
      feedName: 'Publisher',
      websiteUrl: 'https://example.com',
      oldRssUrl: 'https://example.com/old.xml'
    })).resolves.toEqual({
      url: 'https://example.com/feed.xml',
      confidence: 0.9,
      reason: 'This is the publisher’s current official feed.'
    });
    expect(mocked.createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4.1-mini',
        temperature: 0.2,
        max_tokens: 300,
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining(
              '"oldRssUrl": "https://example.com/old.xml"'
            )
          })
        ])
      })
    );
  });

  it('rejects missing or malformed JSON completion content', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    mocked.createCompletion
      .mockResolvedValueOnce({ choices: [] })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'not JSON' } }]
      });
    const { rediscoverRssUrl } = await import(
      '../../services/feeds/rediscoverRssUrl.js'
    );
    const input = {
      feedName: 'Publisher',
      websiteUrl: 'https://example.com',
      oldRssUrl: 'https://example.com/old.xml'
    };

    await expect(rediscoverRssUrl(input)).rejects.toThrow(
      'Invalid JSON returned from OpenAI'
    );
    await expect(rediscoverRssUrl(input)).rejects.toThrow(
      'Invalid JSON returned from OpenAI'
    );
  });
});
