import api from './client';

const AGENT_TIMEOUT_MS = 60000;
const MAX_CONVERSATION_MESSAGES = 13;
const MAX_CONVERSATION_MESSAGE_CHARACTERS = 1200;

const renderedHtmlToText = html => {
  const document = new DOMParser().parseFromString(String(html || ''), 'text/html');
  return (document.body.textContent || '').replace(/\s+/g, ' ').trim();
};

export const compactAgentMessages = messages => messages
  .filter(message => message?.role === 'user' || message?.role === 'assistant')
  .slice(-MAX_CONVERSATION_MESSAGES)
  .map(message => ({
    role: message.role,
    content: (message.role === 'assistant'
      ? message.historyContent ?? renderedHtmlToText(message.content)
      : String(message.content ?? '').trim()
    ).slice(0, MAX_CONVERSATION_MESSAGE_CHARACTERS)
  }))
  .filter(message => message.content);

const parseSseBlock = block => {
  let event = 'message';
  const data = [];

  block.split('\n').forEach(line => {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  });

  if (data.length === 0) return null;
  return { event, data: JSON.parse(data.join('\n')) };
};

/**
 * Streams a chat response and resolves with the authoritative final output.
 */
export const sendChatMessages = async (messages, { onEvent, signal } = {}) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    const response = await api.post('/agent', {
      messages: compactAgentMessages(messages)
    }, {
      adapter: 'fetch',
      headers: {
        Accept: 'text/event-stream'
      },
      responseType: 'stream',
      signal: controller.signal,
      timeout: AGENT_TIMEOUT_MS
    });

    if (!response.data) throw new Error('Agent response stream is unavailable');

    const reader = response.data.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalOutput = '';

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        const parsed = parseSseBlock(block);
        if (!parsed) continue;
        if (parsed.event === 'error') throw new Error(parsed.data.error || 'Agent stream failed');
        if (parsed.event === 'complete') finalOutput = parsed.data.output ?? '';
        onEvent?.(parsed);
      }

      if (done) break;
    }

    return { data: { output: finalOutput } };
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
};
