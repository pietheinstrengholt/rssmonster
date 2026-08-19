import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const completionsCreate = vi.fn();
const OpenAIMock = vi.fn(function MockOpenAI() {
  this.chat = {
    completions: {
      create: completionsCreate
    }
  };
});

vi.mock('openai', () => ({
  default: OpenAIMock
}));

describe('getSmartFolderRecommendations', () => {
  beforeEach(() => {
    vi.resetModules();
    completionsCreate.mockReset();
    OpenAIMock.mockClear();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // Verifies that personalized insights reach the provider and valid suggestions are returned unchanged.
  it('requests and returns valid smart-folder recommendations', async () => {
    const recommendations = {
      smartFolders: [{
        name: 'Unread AI',
        query: 'AI unread:true sort:recommended',
        reason: 'AI appears across favorites and tags.'
      }]
    };
    completionsCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(recommendations) } }]
    });
    const insights = {
      interests: { topTags: ['AI'] },
      favoriteItems: [{ title: 'OpenAI launches a new model' }]
    };

    const { getSmartFolderRecommendations } = await import(
      '../src/smartFolderRecommendations/smartFolderRecommendationService.js'
    );
    const result = await getSmartFolderRecommendations({ insights });

    expect(result).toEqual(recommendations);
    expect(OpenAIMock).toHaveBeenCalledWith({ apiKey: 'test-key' });
    expect(completionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      max_tokens: 300
    }));

    const request = completionsCreate.mock.calls[0][0];
    expect(request.messages[0]).toEqual({
      role: 'system',
      content: 'Return ONLY valid JSON. No markdown. No prose.'
    });
    expect(request.messages[1].content).toContain(JSON.stringify(insights));
  });

  // Verifies that markdown fences around otherwise valid provider JSON are tolerated.
  it('parses fenced JSON responses', async () => {
    completionsCreate.mockResolvedValue({
      choices: [{
        message: {
          content: '```json\n{"smartFolders":[{"name":"Favorites","query":"favorite:true","reason":"Saved items"}]}\n```'
        }
      }]
    });

    const { getSmartFolderRecommendations } = await import(
      '../src/smartFolderRecommendations/smartFolderRecommendationService.js'
    );

    await expect(getSmartFolderRecommendations({ insights: {} })).resolves.toEqual({
      smartFolders: [{
        name: 'Favorites',
        query: 'favorite:true',
        reason: 'Saved items'
      }]
    });
  });

  // Verifies that a JSON object can be recovered from incidental surrounding prose.
  it('extracts JSON embedded in provider prose', async () => {
    completionsCreate.mockResolvedValue({
      choices: [{
        message: {
          content: 'Suggested result:\n{"smartFolders":[{"name":"Today","query":"@today","reason":"Recent reading"}]}\nDone.'
        }
      }]
    });

    const { getSmartFolderRecommendations } = await import(
      '../src/smartFolderRecommendations/smartFolderRecommendationService.js'
    );

    await expect(getSmartFolderRecommendations({ insights: {} })).resolves.toEqual({
      smartFolders: [{
        name: 'Today',
        query: '@today',
        reason: 'Recent reading'
      }]
    });
  });

  // Verifies that unusable provider responses degrade to the documented empty result.
  it.each([
    ['missing content', { choices: [] }],
    ['non-string content', { choices: [{ message: { content: 42 } }] }],
    ['prose without JSON', { choices: [{ message: { content: 'No suggestions available' } }] }],
    ['malformed embedded JSON', { choices: [{ message: { content: 'Result: {"smartFolders": [}' } }] }],
    ['missing smartFolders', { choices: [{ message: { content: '{"result":[]}' } }] }],
    ['non-array smartFolders', { choices: [{ message: { content: '{"smartFolders":{}}' } }] }]
  ])('returns an empty result for %s', async (_label, response) => {
    completionsCreate.mockResolvedValue(response);

    const { getSmartFolderRecommendations } = await import(
      '../src/smartFolderRecommendations/smartFolderRecommendationService.js'
    );

    await expect(getSmartFolderRecommendations({ insights: {} })).resolves.toEqual({
      smartFolders: []
    });
    expect(console.warn).toHaveBeenCalledWith(
      'LLM returned invalid JSON, falling back to empty result'
    );
  });

  // Verifies that configuration errors are raised before attempting a provider request.
  it('rejects when the OpenAI API key is not configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');

    const { getSmartFolderRecommendations } = await import(
      '../src/smartFolderRecommendations/smartFolderRecommendationService.js'
    );

    await expect(getSmartFolderRecommendations({ insights: {} })).rejects.toThrow(
      'OpenAI API key not configured'
    );
    expect(OpenAIMock).not.toHaveBeenCalled();
    expect(completionsCreate).not.toHaveBeenCalled();
  });

  // Verifies that provider failures remain visible to the caller for centralized handling.
  it('propagates provider errors', async () => {
    const providerError = new Error('Provider unavailable');
    completionsCreate.mockRejectedValue(providerError);

    const { getSmartFolderRecommendations } = await import(
      '../src/smartFolderRecommendations/smartFolderRecommendationService.js'
    );

    await expect(getSmartFolderRecommendations({ insights: {} })).rejects.toBe(providerError);
  });
});

