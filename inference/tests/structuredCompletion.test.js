import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStructuredCompletion } from '../src/providers/structuredCompletion.js';
import { getSafeErrorDetails } from '../src/debug.js';

const request = { model: 'test', messages: [{ role: 'user', content: 'private prompt' }], max_tokens: 96 };
const options = { operation: 'semantic-labels' };
const createClient = response => ({ chat: { completions: { create: vi.fn().mockResolvedValue(response) } } });
afterEach(() => vi.restoreAllMocks());

describe('structured completion budget diagnostics', () => {
  it.each([
    { content: '', reasoning_content: 'private reasoning' },
    { content: '  ', reasoning: 'private reasoning' },
    { content: '{"island":' },
    { content: '{"island":"private answer"}' },
    { content: '' }
  ])('rejects truncated output and retains safe diagnostics', async message => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createClient({ choices: [{ finish_reason: 'length', message }], usage: { completion_tokens: 96 } });
    let failure;
    try { await createStructuredCompletion(client, request, options); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: 'INFERENCE_COMPLETION_BUDGET_EXHAUSTED' });
    expect(getSafeErrorDetails(failure)).toMatchObject({ code: 'INFERENCE_COMPLETION_BUDGET_EXHAUSTED' });
    expect(warn.mock.calls[0][1]).toMatchObject({
      operation: 'semantic-labels', finishReason: 'length', tokenBudget: 96, completionTokens: 96,
      hasReasoning: Boolean(message.reasoning_content || message.reasoning)
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private');
    expect(client.chat.completions.create).toHaveBeenCalledOnce();
  });

  it.each(['{"island":null}', '{"smartFolders":[]}', '{"url":null}', '{"tags":[]}'])(
    'preserves a completed empty domain result: %s', async content => {
      const client = createClient({ choices: [{ finish_reason: 'stop', message: { content, reasoning: 'private reasoning' } }] });
      await expect(createStructuredCompletion(client, request, options)).resolves.toBe(content);
    }
  );

  it('does not infer truncation from reasoning alone or malformed output', async () => {
    const client = createClient({ choices: [{ message: { content: '', reasoning_content: 'private reasoning' } }] });
    await expect(createStructuredCompletion(client, request, options)).resolves.toBe('');
  });

  it('keeps backend errors and does not retry with different reasoning settings', async () => {
    const error = Object.assign(new Error('Unsupported reasoning_effort'), { status: 400 });
    const client = createClient({});
    client.chat.completions.create.mockRejectedValue(error);
    await expect(createStructuredCompletion(client, request, { ...options, reasoningEffort: 'none' }))
      .rejects.toBe(error);
    expect(client.chat.completions.create).toHaveBeenCalledOnce();
  });
});
