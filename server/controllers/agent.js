// server/controllers/agent.js
import assistant from '../services/ai/capabilities/assistant.js';
import { createAgentToolToken } from '../services/agent/toolAuthentication.js';
import sanitizeAgentOutput, { agentOutputToText } from '../utils/sanitizeAgentOutput.js';
import { createRssMonsterToolRegistry } from '../services/agent/rssMonsterAgentTools.js';
import { getSafeInferenceErrorDetails } from '../services/ai/errors.js';

const elapsedMs = startedAt => Math.round((performance.now() - startedAt) * 10) / 10;
const SAFE_ERROR_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const MAX_SAFE_STACK_FRAMES = 6;
const MAX_SAFE_STACK_FRAME_LENGTH = 500;
const URL_IN_STACK_FRAME = /\bhttps?:\/\/[^\s"'<>]+/gi;
const isSafeErrorIdentifier = value =>
  typeof value === 'string' && SAFE_ERROR_IDENTIFIER.test(value);

const isInferenceError = error =>
  String(error?.code || '').startsWith('INFERENCE_') ||
  String(error?.name || '').startsWith('Inference');

// Preserve code locations for internal failures without logging their potentially sensitive message.
const getSafeAgentErrorDetails = error => {
  const name = isSafeErrorIdentifier(error?.name) ? error.name : 'Error';
  const code = isSafeErrorIdentifier(error?.code) ? error.code : null;
  const stackFrames = String(error?.stack || '')
    .split('\n')
    .slice(1, MAX_SAFE_STACK_FRAMES + 1)
    .map(frame => frame
      .replace(URL_IN_STACK_FRAME, '<redacted-url>')
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .trim()
      .slice(0, MAX_SAFE_STACK_FRAME_LENGTH))
    .filter(Boolean);

  return Object.freeze({
    name,
    message: 'Assistant execution failed',
    ...(code ? { code } : {}),
    ...(stackFrames.length > 0 ? { stackFrames } : {})
  });
};

const logAgentTiming = timing => {
  console.log(`[AGENT_TIMING] ${JSON.stringify(timing)}`);
};

const writeSseEvent = (res, event, data) => {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_MESSAGE_CHARACTERS = 1200;
const MAX_HISTORY_CHARACTERS = 8000;
const HISTORY_FILTER_FIELDS = [
  'articleIds',
  'categoryId',
  'categoryIds',
  'clicked',
  'dateBasis',
  'feedId',
  'feedIds',
  'favorite',
  'format',
  'from',
  'hot',
  'query',
  'search',
  'sort',
  'status',
  'tag',
  'tags',
  'to'
];

const compactChatHistory = (messages, currentUserIndex) => {
  const candidates = messages
    .slice(0, currentUserIndex)
    .filter(message => message?.role === 'user' || message?.role === 'assistant')
    .slice(-MAX_HISTORY_MESSAGES)
    .map(message => ({
      role: message.role,
      content: (message.role === 'assistant'
        ? agentOutputToText(message.historyContent ?? message.content)
        : String(message.content ?? '').trim()
      ).slice(0, MAX_HISTORY_MESSAGE_CHARACTERS)
    }))
    .filter(message => message.content);

  let remainingCharacters = MAX_HISTORY_CHARACTERS;
  return candidates.reverse().reduce((history, message) => {
    if (remainingCharacters <= 0) return history;
    const content = message.content.slice(-remainingCharacters);
    remainingCharacters -= content.length;
    history.unshift({ ...message, content });
    return history;
  }, []);
};

const compactToolContext = ({ input = {}, name, result = {} }) => {
  const resultData = result?.ok === true ? result.data : result;
  const filters = Object.fromEntries(HISTORY_FILTER_FIELDS
    .filter(field => input[field] !== undefined)
    .map(field => [field, input[field]]));
  const articleIds = [
    ...(Array.isArray(resultData?.articles) ? resultData.articles.map(article => article.id) : []),
    ...(Array.isArray(resultData?.requestedArticleIds) ? resultData.requestedArticleIds : [])
  ].filter(Number.isInteger);

  return {
    tool: name,
    ...(Object.keys(filters).length ? { filters } : {}),
    ...(articleIds.length ? { articleIds: [...new Set(articleIds)].slice(0, 20) } : {})
  };
};

const semanticHistoryContent = (html, toolContexts) => {
  const summary = agentOutputToText(html);
  const context = toolContexts.length
    ? ` Context: ${JSON.stringify(toolContexts.slice(-5))}`
    : '';
  return `${summary}${context}`.slice(0, MAX_HISTORY_MESSAGE_CHARACTERS);
};


export const postAgent = async (req, res) => {
  const userId = req.userData?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Missing authenticated user' });
  }
  const requestStartedAt = performance.now();
  const toolDurations = [];
  const toolContexts = [];
  const abortController = new AbortController();
  res.on?.('close', () => {
    if (!res.writableEnded) abortController.abort();
  });
  try {
    const toolSetupStartedAt = performance.now();
    const registry = createRssMonsterToolRegistry(userId);
    const tools = registry.definitions;
    const toolToken = createAgentToolToken(req.userData, tools.map(tool => tool.name));
    const toolSetupMs = elapsedMs(toolSetupStartedAt);

    // Extract the active user turn and retain only bounded semantic history before it.
    const messages = req.body.messages;
    let input = req.body.input ?? "";
    let chatHistory = [];
    
    // If messages array exists, build chat history and find the last user message
    if (Array.isArray(messages) && messages.length > 0) {
      const currentUserIndex = messages.findLastIndex(message => message?.role === 'user');
      if (currentUserIndex >= 0) {
        input = String(messages[currentUserIndex].content ?? '');
        chatHistory = compactChatHistory(messages, currentUserIndex);
      }
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    writeSseEvent(res, 'status', { message: 'Agent is thinking…' });

    const agentRunStartedAt = performance.now();
    const stream = assistant.runStream({
      input, chatHistory, tools, toolToken
    }, { signal: abortController.signal, circuitKey: 'assistant' });
    let finalOutput;
    let agentSetupMs = 0;
    for await (const event of stream) {
      if (event.type === 'text') {
        writeSseEvent(res, 'text', { output: sanitizeAgentOutput(event.output) });
      } else if (event.type === 'tool_status') {
        writeSseEvent(res, 'tool_status', { name: event.name, status: event.status });
      } else if (event.type === 'complete') {
        finalOutput = event.finalOutput;
        agentSetupMs = event.agentSetupMs;
        for (const toolResult of event.toolResults) toolContexts.push(compactToolContext(toolResult));
        for (const timing of event.toolDurations) {
          toolDurations.push(timing);
          logAgentTiming({ phase: 'tool', ...timing });
        }
      } else if (event.type === 'error') {
        throw Object.assign(new Error('Assistant inference failed'), { code: 'INFERENCE_STREAM_ERROR' });
      }
    }
    if (finalOutput === undefined) {
      throw Object.assign(new Error('Assistant inference ended without a result'), { code: 'INFERENCE_STREAM_ERROR' });
    }
    const agentRunMs = elapsedMs(agentRunStartedAt);
    const toolExecutionMs = Math.round(
      toolDurations.reduce((total, timing) => total + timing.durationMs, 0) * 10
    ) / 10;
    const totalMs = elapsedMs(requestStartedAt);
    const requestTiming = {
      phase: 'request',
      agentRunMs,
      agentSetupMs,
      modelAndGenerationMs: Math.max(0, Math.round((agentRunMs - toolExecutionMs) * 10) / 10),
      toolCalls: toolDurations.length,
      toolExecutionMs,
      toolSetupMs,
      totalMs
    };
    logAgentTiming(requestTiming);
    writeSseEvent(res, 'timing', requestTiming);
    finalOutput = sanitizeAgentOutput(finalOutput);
    writeSseEvent(res, 'history', {
      content: semanticHistoryContent(finalOutput, toolContexts)
    });
    writeSseEvent(res, 'complete', { output: finalOutput });
    return res.end();
  } catch (err) {
    logAgentTiming({
      phase: 'request_error',
      totalMs: elapsedMs(requestStartedAt)
    });
    const inferenceError = isInferenceError(err);
    const safeError = inferenceError
      ? getSafeInferenceErrorDetails(err, { capability: 'assistant' })
      : getSafeAgentErrorDetails(err);
    const clientError = inferenceError ? safeError.message : 'Assistant request failed';
    console.error('Agent run error:', safeError);
    if (res.headersSent) {
      writeSseEvent(res, 'error', { error: clientError });
      return res.end();
    }
    return res.status(500).json({ error: clientError });
  }
};

export default { postAgent };
