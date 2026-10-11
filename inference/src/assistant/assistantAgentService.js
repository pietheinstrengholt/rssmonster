import { Agent, Runner, tool } from '@openai/agents';
import assistantModelService from './assistantModelService.js';
import { RSSMONSTER_AGENT_INSTRUCTIONS } from './instructions.js';

const elapsedMs = start => Math.round((performance.now() - start) * 10) / 10;

export const createAssistantAgentService = ({
  environment = process.env,
  modelService = assistantModelService,
  fetchImplementation = fetch
} = {}) => ({
  async *stream({ input, chatHistory = [], tools, toolToken }, { signal } = {}) {
    const callbackUrl = new URL(environment.ASSISTANT_TOOL_URL || 'http://127.0.0.1:3000/api/agent/tools');
    if (!['http:', 'https:'].includes(callbackUrl.protocol) || callbackUrl.username ||
        callbackUrl.password || callbackUrl.hash || callbackUrl.search) {
      throw new Error('Invalid ASSISTANT_TOOL_URL');
    }
    if (typeof input !== 'string' || !Array.isArray(chatHistory) || !Array.isArray(tools) ||
        tools.length > 50 || typeof toolToken !== 'string' || !toolToken) {
      throw new Error('Invalid assistant run');
    }
    const setupStartedAt = performance.now();
    const toolResults = [];
    const toolDurations = [];
    const remoteTools = tools.map(definition => tool({
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      strict: false,
      errorFunction: null,
      execute: async input => {
        const start = performance.now();
        const requestSignal = AbortSignal.timeout(30_000);
        const response = await fetchImplementation(callbackUrl.href, {
          method: 'POST',
          redirect: 'error',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${toolToken}` },
          body: JSON.stringify({ name: definition.name, input }),
          signal: signal ? AbortSignal.any([signal, requestSignal]) : requestSignal
        });
        if (!response.ok) throw new Error('Assistant tool request failed');
        const body = await response.json();
        if (!body || !Object.hasOwn(body, 'result')) throw new Error('Invalid assistant tool response');
        toolResults.push({ name: definition.name, input, result: body.result });
        toolDurations.push({ name: definition.name, durationMs: elapsedMs(start) });
        return body.result;
      }
    }));
    const reasoningEffort = String(environment.ASSISTANT_REASONING_EFFORT || '').trim();
    const agent = new Agent({
      name: 'RSS feeds management and retrieval assistant',
      instructions: RSSMONSTER_AGENT_INSTRUCTIONS,
      ...(reasoningEffort ? { modelSettings: { reasoning: { effort: reasoningEffort } } } : {}),
      tools: remoteTools
    });
    const runner = new Runner({
      modelProvider: { getModel: () => modelService.getModel() },
      tracingDisabled: true
    });
    const agentSetupMs = elapsedMs(setupStartedAt);
    const result = await runner.run(agent, input, { chatHistory, signal, stream: true });
    let output = '';
    const toolNames = new Map();
    for await (const event of result) {
      if (event.type === 'raw_model_stream_event' && event.data.type === 'output_text_delta') {
        output += event.data.delta;
        yield { type: 'text', output };
      } else if (event.type === 'run_item_stream_event' &&
          ['tool_called', 'tool_output'].includes(event.name)) {
        const callId = event.item?.rawItem?.callId;
        if (event.name === 'tool_called') toolNames.set(callId, event.item?.rawItem?.name);
        yield {
          type: 'tool_status',
          name: toolNames.get(callId) ?? event.item?.rawItem?.name ?? 'RSSMonster tool',
          status: event.name === 'tool_called' ? 'started' : 'completed'
        };
      }
    }
    await result.completed;
    signal?.throwIfAborted();
    if (result.finalOutput === undefined) throw new Error('Assistant run ended without a result');
    yield { type: 'complete', finalOutput: result.finalOutput, toolResults, toolDurations, agentSetupMs };
  }
});

export default createAssistantAgentService();
