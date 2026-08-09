import api from '../api/client.js';

export const FEED_REFRESH_EVENT_TYPES = Object.freeze([
  'refresh_started',
  'feed_started',
  'feed_parsed',
  'articles_inserted_updated',
  'feed_error',
  'feed_completed',
  'done',
  'error',
  'progress'
]);

// Parses one named refresh event without applying application state.
export function parseFeedRefreshEvent(event) {
  return {
    type: event.type,
    payload: JSON.parse(event.data || '{}')
  };
}

// Opens an authenticated SSE-compatible stream for one feed-refresh job.
export function openFeedRefreshEvents(jobId) {
  const url = `${import.meta.env.VITE_VUE_APP_HOSTNAME}/api/feeds/refresh/${encodeURIComponent(jobId)}/events`;
  const listeners = new Map();
  const decoder = new TextDecoder();
  let abortController = null;
  let closed = false;
  let reconnectDelayMs = 3000;
  let reconnectTimer = null;
  let terminalEventReceived = false;

  // Delivers one parsed server event through the EventSource-compatible interface.
  const dispatchEvent = (type, data = '', error = null) => {
    const event = { data, error, type };
    const propertyHandler = eventStream[`on${type}`];

    if (typeof propertyHandler === 'function') {
      propertyHandler(event);
    }

    for (const listener of listeners.get(type) || []) {
      listener(event);
    }
  };

  // Parses and dispatches one complete SSE message block.
  const processEventBlock = block => {
    let eventType = 'message';
    const dataLines = [];

    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(':')) continue;

      const separatorIndex = line.indexOf(':');
      const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
      const value = separatorIndex === -1
        ? ''
        : line.slice(separatorIndex + 1).replace(/^ /, '');

      if (field === 'event') {
        eventType = value || 'message';
      } else if (field === 'data') {
        dataLines.push(value);
      } else if (field === 'retry' && /^\d+$/.test(value)) {
        reconnectDelayMs = Number(value);
      }
    }

    if (dataLines.length > 0) {
      terminalEventReceived = eventType === 'done' || eventType === 'error';
      dispatchEvent(eventType, dataLines.join('\n'));
    }
  };

  // Consumes response chunks without buffering the long-lived stream.
  const consumeResponse = async response => {
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error('Streaming responses are not supported in this browser');
    }

    let buffer = '';

    while (!closed) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      blocks.forEach(processEventBlock);
    }
  };

  // Schedules the same automatic reconnect behavior expected from EventSource.
  const scheduleReconnect = () => {
    if (closed || terminalEventReceived || reconnectTimer) return;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelayMs);
  };

  // Opens an authenticated fetch stream without exposing credentials in its URL.
  const connect = async () => {
    abortController = new AbortController();
    const authorization = api.defaults.headers.common.Authorization;
    const headers = { Accept: 'text/event-stream' };

    if (authorization) {
      headers.Authorization = authorization;
    }

    try {
      const response = await fetch(url, {
        headers,
        signal: abortController.signal
      });

      if (!response.ok) {
        const error = new Error(`Feed refresh stream failed with status ${response.status}`);
        error.retryable = response.status >= 500;
        throw error;
      }

      dispatchEvent('open');
      await consumeResponse(response);

      if (!closed && !terminalEventReceived) {
        dispatchEvent('error');
        scheduleReconnect();
      }
    } catch (error) {
      if (closed || terminalEventReceived || error?.name === 'AbortError') return;

      dispatchEvent('error', '', error);
      if (error?.retryable !== false) {
        scheduleReconnect();
      }
    }
  };

  const eventStream = {
    onerror: null,
    onmessage: null,
    onopen: null,

    // Registers a handler for a named SSE event.
    addEventListener(type, listener) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(listener);
    },

    // Closes the active request and prevents future reconnects.
    close() {
      closed = true;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      abortController?.abort();
    },

    // Removes a previously registered named SSE event handler.
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    }
  };

  connect();
  return eventStream;
}
