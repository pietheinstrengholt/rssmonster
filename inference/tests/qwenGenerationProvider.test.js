import { describe, expect, it, vi } from 'vitest';
import { createQwenGenerationProvider } from '../src/generation/providers/qwenGenerationProvider.js';

const { fromProcessor, fromModel } = vi.hoisted(() => ({
  fromProcessor: vi.fn(),
  fromModel: vi.fn()
}));

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

vi.mock('@huggingface/transformers', () => ({
  env: {},
  AutoProcessor: { from_pretrained: fromProcessor },
  Qwen3_5ForConditionalGeneration: { from_pretrained: fromModel }
}));

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
    await provider.initialize();
    expect(dependencies.loadModel).toHaveBeenCalledOnce();
  });

  it('recovers its generation queue after a failed request', async () => {
    const { dependencies, model } = createDependencies();
    model.generate
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ slice: vi.fn(() => ({ decoded: true })) });
    const provider = createQwenGenerationProvider({ dependencies });
    const input = { systemPrompt: 'System', prompt: 'Prompt', maxNewTokens: 1 };

    await expect(provider.generate(input)).rejects.toThrow('temporary failure');
    await expect(provider.generate(input)).resolves.toBe('{"result":"ok"}');
  });

  it('serializes generation through one shared model instance', async () => {
    const { dependencies, model, outputs } = createDependencies();
    const firstDeferred = createDeferred();
    const secondDeferred = createDeferred();
    model.generate
      .mockImplementationOnce(() => firstDeferred.promise)
      .mockImplementationOnce(() => secondDeferred.promise);
    const provider = createQwenGenerationProvider({ dependencies });
    const input = { systemPrompt: 'System', prompt: 'Prompt', maxNewTokens: 1 };

    const first = provider.generate(input);
    const second = provider.generate(input);
    await vi.waitFor(() => expect(model.generate).toHaveBeenCalledOnce());

    firstDeferred.resolve(outputs);
    await expect(first).resolves.toBe('{"result":"ok"}');
    await vi.waitFor(() => expect(model.generate).toHaveBeenCalledTimes(2));
    secondDeferred.resolve(outputs);
    await expect(second).resolves.toBe('{"result":"ok"}');
  });

  it('enforces configured pending capacity and exposes its snapshot', async () => {
    const { dependencies, model, outputs } = createDependencies();
    const firstDeferred = createDeferred();
    const secondDeferred = createDeferred();
    model.generate
      .mockImplementationOnce(() => firstDeferred.promise)
      .mockImplementationOnce(() => secondDeferred.promise);
    const provider = createQwenGenerationProvider({
      environment: {
        GENERATION_QUEUE_MAX_PENDING: '1',
        INFERENCE_DEBUG: 'true'
      },
      dependencies
    });
    const input = { systemPrompt: 'System', prompt: 'Prompt', maxNewTokens: 1 };
    const first = provider.generate(input);
    const second = provider.generate(input);

    await expect(provider.generate(input)).rejects.toMatchObject({
      name: 'InferenceQueueFullError',
      code: 'INFERENCE_QUEUE_FULL',
      queue: { running: 1, pending: 1, maximumPending: 1, concurrency: 1 }
    });
    expect(provider.getQueueSnapshot()).toMatchObject({
      running: 1,
      pending: 1,
      maximumPending: 1,
      rejected: 1
    });
    expect(dependencies.logger.log.mock.calls.flat().join('\n')).toContain(
      'generation-queue stage=overload_rejected'
    );

    await vi.waitFor(() => expect(model.generate).toHaveBeenCalledOnce());
    firstDeferred.resolve(outputs);
    await first;
    await vi.waitFor(() => expect(model.generate).toHaveBeenCalledTimes(2));
    secondDeferred.resolve(outputs);
    await second;
  });

  it('propagates running aborts while retaining capacity until model settlement', async () => {
    const { dependencies, model, outputs } = createDependencies();
    const generationDeferred = createDeferred();
    model.generate.mockImplementationOnce(() => generationDeferred.promise);
    const provider = createQwenGenerationProvider({
      environment: { INFERENCE_DEBUG: 'true' },
      dependencies
    });
    const controller = new AbortController();
    const generation = provider.generate({
      systemPrompt: 'System',
      prompt: 'Prompt',
      maxNewTokens: 1,
      signal: controller.signal,
      requestId: 'abort-request',
      operation: 'test-generation'
    });
    await vi.waitFor(() => expect(model.generate).toHaveBeenCalledOnce());

    controller.abort();

    await expect(generation).rejects.toMatchObject({
      name: 'InferenceQueueAbortError',
      code: 'INFERENCE_QUEUE_ABORTED',
      phase: 'running',
      requestId: 'abort-request',
      operation: 'test-generation'
    });
    expect(provider.getQueueSnapshot()).toMatchObject({ running: 1, aborted: 1 });
    expect(dependencies.logger.log.mock.calls.flat().join('\n')).toContain(
      'generation-queue stage=client_aborted_running requestId="abort-request"'
    );
    generationDeferred.resolve(outputs);
    await vi.waitFor(() => expect(provider.getQueueSnapshot().running).toBe(0));
  });

  it('logs and removes pending generation aborted by its consumer', async () => {
    const { dependencies, model, outputs } = createDependencies();
    const runningDeferred = createDeferred();
    model.generate.mockImplementationOnce(() => runningDeferred.promise);
    const provider = createQwenGenerationProvider({
      environment: { INFERENCE_DEBUG: 'true' },
      dependencies
    });
    const running = provider.generate({
      systemPrompt: 'System',
      prompt: 'Running',
      maxNewTokens: 1
    });
    const controller = new AbortController();
    const pending = provider.generate({
      systemPrompt: 'System',
      prompt: 'Pending',
      maxNewTokens: 1,
      signal: controller.signal,
      requestId: 'pending-request',
      operation: 'article-tag-generation'
    });

    controller.abort();

    await expect(pending).rejects.toMatchObject({
      code: 'INFERENCE_QUEUE_ABORTED',
      phase: 'pending'
    });
    expect(dependencies.logger.log.mock.calls.flat().join('\n')).toContain(
      'generation-queue stage=client_aborted_pending requestId="pending-request"'
    );
    expect(provider.getQueueSnapshot()).toMatchObject({ running: 1, pending: 0 });
    await vi.waitFor(() => expect(model.generate).toHaveBeenCalledOnce());
    runningDeferred.resolve(outputs);
    await running;
  });

  it('logs content-safe queue lifecycle diagnostics with request context', async () => {
    const { dependencies } = createDependencies();
    const provider = createQwenGenerationProvider({
      environment: { INFERENCE_DEBUG: 'true' },
      dependencies
    });

    await provider.generate({
      systemPrompt: 'private system prompt',
      prompt: 'private article text',
      maxNewTokens: 1,
      requestId: 'request-123',
      operation: 'article-summary'
    });

    const queueLogs = dependencies.logger.log.mock.calls
      .map(([message]) => message)
      .filter(message => message.includes('generation-queue'));
    expect(queueLogs).toHaveLength(3);
    expect(queueLogs[0]).toContain('stage=queued');
    expect(queueLogs[1]).toMatch(
      /stage=inference_started .*requestId="request-123" .*operation="article-summary" .*queueWaitMs=\d+/
    );
    expect(queueLogs[2]).toMatch(/stage=inference_completed .*executionMs=\d+/);
    expect(queueLogs.every(log => log.includes('running=') && log.includes('pending=')))
      .toBe(true);
    expect(queueLogs.join('\n')).not.toContain('private system prompt');
    expect(queueLogs.join('\n')).not.toContain('private article text');
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

  it('loads the default processor and model', async () => {
    fromProcessor.mockResolvedValue(vi.fn());
    fromModel.mockResolvedValue({ generate: vi.fn() });
    const provider = createQwenGenerationProvider({ environment: {} });

    await provider.initialize();

    expect(fromProcessor).toHaveBeenCalledWith('onnx-community/Qwen3.5-0.8B-ONNX');
    expect(fromModel).toHaveBeenCalledWith(
      'onnx-community/Qwen3.5-0.8B-ONNX',
      {
        dtype: { embed_tokens: 'q4', vision_encoder: 'q4', decoder_model_merged: 'q4' },
        device: 'cpu'
      }
    );
  });
});
