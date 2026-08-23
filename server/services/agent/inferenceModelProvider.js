import { getInferenceRequestConfig, requestInferenceJson } from '../inference/inferenceClient.js';
import { assertInferenceEnabled } from '../../config/intelligentFeatures.js';

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
    }, { ...this.options, signal: request.signal });
  }

  async *getStreamedResponse(request) {
    assertInferenceEnabled();
    const { baseUrl, timeoutMs, fetchImplementation } = getInferenceRequestConfig(this.options);
    const response = await fetchImplementation(
      `${baseUrl.replace(/\/$/, '')}/api/assistant/model/stream`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: serializableRequest(request)
        }),
        signal: request.signal || AbortSignal.timeout(timeoutMs)
      }
    );

    if (!response.ok || !response.body) {
      throw new Error(`Assistant inference request failed with HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
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
  }
}

export const createInferenceModelProvider = options => ({
  getModel: () => new InferenceAgentModel(options)
});

export default createInferenceModelProvider();
