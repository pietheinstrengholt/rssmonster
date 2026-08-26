import { randomUUID } from 'node:crypto';
import {
  createInferenceRequestSignal,
  getInferenceRequestConfig,
  InferenceHttpError,
  InferenceServiceUnavailableError,
  InferenceTimeoutError,
  requestInferenceJson
} from '../inference/inferenceClient.js';
import { assertInferenceEnabled } from '../../config/intelligentFeatures.js';

const STREAM_PATH = '/api/assistant/model/stream';

const serializableRequest = request => {
  const payload = { ...request };
  delete payload.signal;
  return payload;
};

class InferenceAgentModel {
  constructor(options = {}) {
    this.options = options;
  }

  getResponse(request) {
    return requestInferenceJson('/api/assistant/model', {
      request: serializableRequest(request)
    }, { ...this.options, circuitKey: 'assistant', signal: request.signal });
  }

  async *getStreamedResponse(request) {
    assertInferenceEnabled();
    const { baseUrl, timeoutMs, fetchImplementation } = getInferenceRequestConfig(this.options);
    const requestId = randomUUID();
    const startedAt = Date.now();
    const requestSignal = createInferenceRequestSignal(timeoutMs, request.signal);
    const attachMetadata = error => Object.assign(error, {
      requestId,
      inferencePath: STREAM_PATH,
      durationMs: Date.now() - startedAt
    });
    const callerAbortedRequest = () => Boolean(
      request.signal?.aborted &&
      requestSignal.aborted &&
      requestSignal.reason === request.signal.reason
    );
    const wrapFailure = (cause, phase) => {
      if (callerAbortedRequest()) {
        const error = new Error('Assistant inference request aborted', { cause });
        error.name = 'AbortError';
        error.code = 'ABORT_ERR';
        return attachMetadata(error);
      }
      if (requestSignal.aborted) {
        return attachMetadata(new InferenceTimeoutError(timeoutMs, cause));
      }
      if (phase === 'transport') {
        return attachMetadata(new InferenceServiceUnavailableError(baseUrl, cause));
      }
      const error = new Error('Assistant inference stream failed', { cause });
      error.name = 'InferenceStreamError';
      error.code = 'INFERENCE_STREAM_ERROR';
      return attachMetadata(error);
    };
    let response;
    try {
      response = await fetchImplementation(`${baseUrl.replace(/\/$/, '')}${STREAM_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId
        },
        body: JSON.stringify({
          request: serializableRequest(request)
        }),
        signal: requestSignal
      });
    } catch (error) {
      throw wrapFailure(error, 'transport');
    }

    if (!response.ok || !response.body) {
      throw attachMetadata(new InferenceHttpError(response.status));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) yield JSON.parse(line);
        }
        if (done) break;
      }
      if (buffer.trim()) yield JSON.parse(buffer);
    } catch (error) {
      throw wrapFailure(error, 'stream');
    }
  }
}

export const createInferenceModelProvider = options => ({
  getModel: () => new InferenceAgentModel(options)
});

export default createInferenceModelProvider();
