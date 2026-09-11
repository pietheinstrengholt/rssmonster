import provider from '../providers/inference.js';
import { AIValidationError, isRecord } from '../errors.js';

const prepareRequest = (request, options) => {
  if (!isRecord(request) || !(typeof request.input === 'string' || Array.isArray(request.input))) {
    throw new AIValidationError('Assistant');
  }
  const { signal, ...payload } = request;
  return { payload, options: { ...options, signal: signal || options.signal } };
};

export const createAssistantCapability = (inference = provider) => ({
  async chat(request, options = {}) {
    const prepared = prepareRequest(request, options);
    const response = await inference.assistantChat(prepared.payload, prepared.options);
    if (!isRecord(response) || !Array.isArray(response.output)) throw new AIValidationError('Assistant', true);
    return response;
  },
  async *stream(request, options = {}) {
    const prepared = prepareRequest(request, options);
    for await (const event of inference.assistantStream(prepared.payload, prepared.options)) {
      if (!isRecord(event) || typeof event.type !== 'string') throw new AIValidationError('Assistant stream', true);
      yield event;
    }
  }
});

export default createAssistantCapability();
