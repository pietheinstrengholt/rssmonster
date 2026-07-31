import api from './client';

/**
 * Fetch all feeds
 */
export const fetchFeeds = () =>
  api.get('/feeds');

/**
 * Validate a feed URL
 */
export const validateFeed = (url, categoryId) =>
  api.post('/feeds/validate', { url, categoryId });

/**
 * Mute feed until a given ISO date
 */
export const muteFeed = (feedId, mutedUntil) =>
  api.post(`/feeds/mute/${feedId}`, { mutedUntil });

/**
 * Create a new feed
 */
export const createFeed = ({ categoryId, feedName, feedDesc, feedType, url, status, crawlSince }) =>
  api.post('/feeds', { categoryId, feedName, feedDesc, feedType, url, status, crawlSince });

/**
 * Update a feed
 */
export const updateFeed = (feedId, feedData) =>
  api.put(`/feeds/${feedId}`, feedData);

/**
 * Rediscover RSS feed using AI
 */
export const rediscoverRss = (feedId) =>
  api.post(`/feeds/${feedId}/rediscover-rss`);

/**
 * Delete a feed
 */
export const deleteFeed = (feedId) =>
  api.delete(`/feeds/${feedId}`);

/**
 * Start a feed refresh job
 */
export const startFeedRefresh = () =>
  api.post('/feeds/refresh');

/**
 * Recalculate feed trust scores
 */
export const recalculateFeedTrust = () =>
  api.post('/feeds/recalculate-trust', null, { timeout: 120000 });

/**
 * Open SSE stream for a refresh job
 */
export const openFeedRefreshEvents = jobId => {
  const url = `${import.meta.env.VITE_VUE_APP_HOSTNAME}/api/feeds/refresh/${encodeURIComponent(jobId)}/events`;
  const listeners = new Map();
  const decoder = new TextDecoder();
  let abortController = null;
  let closed = false;
  let reconnectDelayMs = 3000;
  let reconnectTimer = null;

  // This function delivers one parsed server event through the EventSource-compatible interface.
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

  // This function parses and dispatches one complete SSE message block.
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
      dispatchEvent(eventType, dataLines.join('\n'));
    }
  };

  // This function consumes response chunks without buffering the long-lived stream.
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

  // This function schedules the same automatic reconnect behavior expected from EventSource.
  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelayMs);
  };

  // This function opens an authenticated fetch stream without exposing credentials in its URL.
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

      if (!closed) {
        dispatchEvent('error');
        scheduleReconnect();
      }
    } catch (error) {
      if (closed || error?.name === 'AbortError') return;

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

    // This method registers a handler for a named SSE event.
    addEventListener(type, listener) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(listener);
    },

    // This method closes the active request and prevents future reconnects.
    close() {
      closed = true;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      abortController?.abort();
    },

    // This method removes a previously registered named SSE event handler.
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    }
  };

  connect();
  return eventStream;
};
