import { describe, expect, it, vi } from 'vitest';
import { createAssistantModelService } from '../src/assistant/assistantModelService.js';

const { OpenAIProviderMock, defaultModel } = vi.hoisted(() => ({
  OpenAIProviderMock: vi.fn(),
  defaultModel: { getResponse: vi.fn().mockResolvedValue({ output: ['default'] }) }
}));

vi.mock('@openai/agents', () => ({
  OpenAIProvider: OpenAIProviderMock.mockImplementation(function Provider() {
    this.getModel = vi.fn().mockReturnValue(defaultModel);
  })
}));

describe('assistant model service', () => {
  it('reuses one provider for normal and streaming model calls', async () => {
    const model = {
      getResponse: vi.fn().mockResolvedValue({ output: [] }),
      getStreamedResponse: vi.fn().mockReturnValue((async function* () { yield { type: 'done' }; })())
    };
    const provider = { getModel: vi.fn().mockResolvedValue(model) };
    const createProvider = vi.fn(() => provider);
    const service = createAssistantModelService({
      environment: { OPENAI_API_KEY: 'key', ASSISTANT_MODEL: 'agent-model' },
      createProvider
    });
    await expect(service.respond({ request: { input: [] } })).resolves.toEqual({ output: [] });
    const stream = await service.stream({ request: { input: [] } });
    await expect(Array.fromAsync(stream)).resolves.toEqual([{ type: 'done' }]);
    expect(createProvider).toHaveBeenCalledOnce();
    expect(provider.getModel).toHaveBeenCalledTimes(2);
    expect(provider.getModel).toHaveBeenCalledWith('agent-model');
  });

  it('requires an API key when the provider is first used', async () => {
    const service = createAssistantModelService({ environment: {} });

    await expect(service.respond({ request: {} })).rejects.toThrow('OPENAI_API_KEY is required');
  });

  it('creates the default OpenAI provider', async () => {
    const service = createAssistantModelService({ environment: { OPENAI_API_KEY: 'default-key' } });

    await expect(service.respond({ request: {} })).resolves.toEqual({ output: ['default'] });
    expect(OpenAIProviderMock).toHaveBeenCalledWith({ apiKey: 'default-key' });
  });
});
