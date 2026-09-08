import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  createCompletion: vi.fn(),
  qwenGenerate: vi.fn(),
  OpenAIMock: vi.fn()
}));

vi.mock('openai', () => ({
  default: mocked.OpenAIMock.mockImplementation(function OpenAI() {
    this.chat = {
      completions: {
        create: mocked.createCompletion
      }
    };
  })
}));

vi.mock('../src/generation/providers/qwenGenerationProvider.js', () => ({
  default: { generate: mocked.qwenGenerate }
}));

describe('generateSemanticLabels', () => {
  beforeEach(() => {
    vi.resetModules();
    mocked.createCompletion.mockReset();
    mocked.qwenGenerate.mockReset();
    mocked.OpenAIMock.mockClear();
    vi.stubEnv('GENERATION_PROVIDER', 'qwen');
    vi.stubEnv('OPENAI_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses one Qwen request for any requested combination of labels', async () => {
    mocked.qwenGenerate.mockResolvedValue(
      '{"event":"OpenAI Releases New Model","topic":"OpenAI Models"}'
    );
    const { generateSemanticLabels } = await import(
      '../src/semanticLabels/semanticLabelService.js'
    );
    const controller = new AbortController();

    await expect(generateSemanticLabels({
      context: { titles: ['OpenAI releases a new model', 'New OpenAI model arrives'] },
      event: true,
      topic: true
    }, {
      requestId: 'semantic-label-request',
      signal: controller.signal
    })).resolves.toEqual({
      event: 'OpenAI Releases New Model',
      topic: 'OpenAI Models'
    });

    expect(mocked.qwenGenerate).toHaveBeenCalledOnce();
    expect(mocked.qwenGenerate).toHaveBeenCalledWith(expect.objectContaining({
      maxNewTokens: 96,
      requestId: 'semantic-label-request',
      signal: controller.signal,
      operation: 'semantic-labels',
      prompt: expect.stringContaining('event: one concrete occurrence')
    }));
    const prompt = mocked.qwenGenerate.mock.calls[0][0].prompt;
    expect(prompt).toContain('topic: recurring subject');
    expect(prompt).not.toContain('island: durable user interest');
  });

  it('returns null for missing or unusable requested labels', async () => {
    mocked.qwenGenerate.mockResolvedValue(
      '```json\n{"event":"  A concise event  ","island":42}\n```'
    );
    const { generateSemanticLabels } = await import(
      '../src/semanticLabels/semanticLabelService.js'
    );

    await expect(generateSemanticLabels({
      context: 'Evidence',
      event: true,
      island: true
    })).resolves.toEqual({
      event: 'A concise event',
      island: null
    });
  });

  it.each([
    ['', null],
    ['not json', null],
    ['prefix {"topic":"Embedded JSON"} suffix', 'Embedded JSON'],
    ['prefix {broken} suffix', null],
    ['{"topic":"   "}', null],
    [`{"topic":"${'x'.repeat(256)}"}`, null],
    ['{"topic":"line\\n break"}', 'line break']
  ])('normalizes provider output %#', async (output, expected) => {
    mocked.qwenGenerate.mockResolvedValue(output);
    const { generateSemanticLabels } = await import(
      '../src/semanticLabels/semanticLabelService.js'
    );

    await expect(generateSemanticLabels({
      context: 'Evidence',
      topic: true
    })).resolves.toEqual({ topic: expected });
  });

  it.each([
    [undefined, 'request body is required'],
    [{ context: 'Evidence' }, 'at least one of event, topic, or island must be true'],
    [{ context: '', event: true }, 'context is required'],
    [{ context: 'Evidence', event: 'yes' }, 'event must be a boolean'],
    [[], 'request body is required'],
    [{ context: null, event: true }, 'context is required'],
    [{ context: 'x'.repeat(6001), topic: true }, 'context must not exceed 6000 characters']
  ])('rejects invalid input %#', async (input, message) => {
    const { generateSemanticLabels } = await import(
      '../src/semanticLabels/semanticLabelService.js'
    );

    await expect(generateSemanticLabels(input)).rejects.toThrow(message);
    expect(mocked.qwenGenerate).not.toHaveBeenCalled();
  });

  it('uses the configured OpenAI generation provider when selected', async () => {
    vi.stubEnv('GENERATION_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_BASE_URL', 'https://litellm.example/v1');
    mocked.createCompletion.mockResolvedValue({
      choices: [{ message: { content: '{"island":"Local AI"}' } }]
    });
    const { generateSemanticLabels } = await import(
      '../src/semanticLabels/semanticLabelService.js'
    );

    await expect(generateSemanticLabels({
      context: ['Qwen', 'self-hosting'],
      island: true
    })).resolves.toEqual({ island: 'Local AI' });
    expect(mocked.createCompletion).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 96
    }));
    expect(mocked.OpenAIMock).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://litellm.example/v1'
    });
    expect(mocked.qwenGenerate).not.toHaveBeenCalled();
  });

  it('omits temperature when configured for a compatible gateway', async () => {
    vi.stubEnv('GENERATION_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_OMIT_TEMPERATURE', 'true');
    mocked.createCompletion.mockResolvedValue({
      choices: [{ message: { content: '{"topic":"Local AI"}' } }]
    });
    const { generateSemanticLabels } = await import(
      '../src/semanticLabels/semanticLabelService.js'
    );

    await generateSemanticLabels({ context: 'Qwen and self-hosting', topic: true });

    expect(mocked.createCompletion).toHaveBeenCalledOnce();
    expect(mocked.createCompletion.mock.calls[0][0]).not.toHaveProperty('temperature');
  });

  it('requires an API key for the OpenAI provider', async () => {
    vi.stubEnv('GENERATION_PROVIDER', 'openai');
    const { generateSemanticLabels } = await import(
      '../src/semanticLabels/semanticLabelService.js'
    );

    await expect(generateSemanticLabels({
      context: 'Evidence',
      topic: true
    })).rejects.toThrow('OpenAI API key not configured');
  });

  it('treats a missing OpenAI response choice as empty output', async () => {
    vi.stubEnv('GENERATION_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    mocked.createCompletion.mockResolvedValue({ choices: [] });
    const { generateSemanticLabels } = await import(
      '../src/semanticLabels/semanticLabelService.js'
    );

    await expect(generateSemanticLabels({
      context: 'Evidence',
      topic: true
    })).resolves.toEqual({ topic: null });
  });
});
