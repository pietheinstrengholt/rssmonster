import { describe, expect, it, vi } from 'vitest';
import { createQwenGenerationProvider } from '../src/generation/providers/qwenGenerationProvider.js';

const createDependencies = () => {
  const slicedOutput = { decoded: true };
  const outputs = { slice: vi.fn(() => slicedOutput) };
  const model = { generate: vi.fn().mockResolvedValue(outputs) };
  const processor = vi.fn().mockResolvedValue({
    input_ids: { dims: [1, 42] },
    attention_mask: 'mask'
  });
  processor.apply_chat_template = vi.fn(() => 'formatted conversation');
  processor.batch_decode = vi.fn(() => ['{"result":"ok"}']);
  return {
    model,
    processor,
    outputs,
    slicedOutput,
    dependencies: {
      configureCache: vi.fn().mockResolvedValue('/cache/models'),
      loadProcessor: vi.fn().mockResolvedValue(processor),
      loadModel: vi.fn().mockResolvedValue(model),
      logger: { log: vi.fn() }
    }
  };
};

describe('Qwen generation provider', () => {
  it('loads one cached q4 model for concurrent initialization', async () => {
    const { dependencies } = createDependencies();
    const provider = createQwenGenerationProvider({ dependencies });

    await Promise.all([provider.initialize(), provider.initialize(), provider.initialize()]);

    expect(dependencies.configureCache).toHaveBeenCalledOnce();
    expect(dependencies.loadProcessor).toHaveBeenCalledOnce();
    expect(dependencies.loadModel).toHaveBeenCalledWith(
      'onnx-community/Qwen3.5-0.8B-ONNX',
      'q4'
    );
    expect(provider.isLoaded()).toBe(true);
  });

  it('applies the chat template and decodes only newly generated tokens', async () => {
    const { model, processor, outputs, slicedOutput, dependencies } = createDependencies();
    const provider = createQwenGenerationProvider({ dependencies });

    await expect(provider.generate({
      systemPrompt: 'Strict JSON only.',
      prompt: 'Generate data.',
      maxNewTokens: 120
    })).resolves.toBe('{"result":"ok"}');

    expect(processor.apply_chat_template).toHaveBeenCalledWith([
      { role: 'system', content: 'Strict JSON only.' },
      { role: 'user', content: 'Generate data.' }
    ], { add_generation_prompt: true });
    expect(model.generate).toHaveBeenCalledWith(expect.objectContaining({
      attention_mask: 'mask',
      max_new_tokens: 120,
      do_sample: false
    }));
    expect(outputs.slice).toHaveBeenCalledWith(null, [42, null]);
    expect(processor.batch_decode).toHaveBeenCalledWith(
      slicedOutput,
      { skip_special_tokens: true }
    );
  });

  it('reports metadata without initializing', () => {
    const { dependencies } = createDependencies();
    const provider = createQwenGenerationProvider({ dependencies });
    expect(provider.getMetadata()).toEqual({
      provider: 'qwen',
      modelId: 'onnx-community/Qwen3.5-0.8B-ONNX',
      dtype: 'q4',
      device: 'cpu',
      task: 'text-generation'
    });
    expect(provider.isLoaded()).toBe(false);
  });
});
