import { describe, expect, it, vi } from 'vitest';
import { createAssistantModelService } from '../src/assistant/assistantModelService.js';

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
});
