import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  createCompletion: vi.fn(),
  qwenGenerate: vi.fn()
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

vi.mock('../src/generation/providers/qwenGenerationProvider.js', () => ({
  default: { generate: mocked.qwenGenerate }
}));

const originalApiKey = process.env.OPENAI_API_KEY;
const originalGenerationProvider = process.env.GENERATION_PROVIDER;

describe('rediscoverRssUrl', () => {
  beforeEach(() => {
    vi.resetModules();
    mocked.createCompletion.mockReset();
    mocked.qwenGenerate.mockReset();
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    if (originalGenerationProvider === undefined) {
      delete process.env.GENERATION_PROVIDER;
    } else {
      process.env.GENERATION_PROVIDER = originalGenerationProvider;
    }
  });

  it('rejects requests when OpenAI is not configured', async () => {
    const { rediscoverRssUrl } = await import(
      '../src/feedRediscovery/feedRediscoveryService.js'
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
      '../src/feedRediscovery/feedRediscoveryService.js'
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

  it('keeps feed rediscovery debug logs free of supplied URLs', async () => {
    process.env.GENERATION_PROVIDER = 'qwen';
    vi.stubEnv('INFERENCE_DEBUG', 'true');
    mocked.qwenGenerate.mockResolvedValue(
      '{"url":null,"confidence":0,"reason":"No replacement."}'
    );
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const feedName = 'Private customer publisher';
    const websiteUrl = 'https://private.example/account/48392?token=secret-value';
    const oldRssUrl = 'https://private.example/feeds/old.xml?key=private-key';
    const { rediscoverRssUrl } = await import(
      '../src/feedRediscovery/feedRediscoveryService.js'
    );

    await rediscoverRssUrl({
      feedName,
      websiteUrl,
      oldRssUrl
    });

    const debugOutput = logSpy.mock.calls.flat().join('\n');
    expect(debugOutput).toContain('calling feed-rediscovery provider=qwen');
    expect(debugOutput).toContain('completed feed-rediscovery provider=qwen');
    expect(debugOutput).not.toContain(websiteUrl);
    expect(debugOutput).not.toContain(oldRssUrl);
    expect(debugOutput).not.toContain(feedName);
    expect(debugOutput).not.toContain('website=');
    logSpy.mockRestore();
  });

  it('rejects missing or malformed JSON completion content', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    mocked.createCompletion
      .mockResolvedValueOnce({ choices: [] })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'not JSON' } }]
      });
    const { rediscoverRssUrl } = await import(
      '../src/feedRediscovery/feedRediscoveryService.js'
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

  it('uses Qwen and reports its name for invalid JSON', async () => {
    process.env.GENERATION_PROVIDER = 'qwen';
    mocked.qwenGenerate
      .mockResolvedValueOnce('{"url":null,"confidence":0,"reason":"No replacement."}')
      .mockResolvedValueOnce('invalid');
    const { rediscoverRssUrl } = await import(
      '../src/feedRediscovery/feedRediscoveryService.js'
    );
    const input = { feedName: 'Publisher' };

    await expect(rediscoverRssUrl(input)).resolves.toEqual({
      url: null,
      confidence: 0,
      reason: 'No replacement.'
    });
    await expect(rediscoverRssUrl(input)).rejects.toThrow('Invalid JSON returned from Qwen');
    expect(mocked.qwenGenerate).toHaveBeenCalledWith(expect.objectContaining({
      maxNewTokens: 300
    }));
  });
});
