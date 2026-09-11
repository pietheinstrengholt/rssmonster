import assistant from '../ai/capabilities/assistant.js';

// Adapt the capability to the Agents SDK model interface; tools and orchestration stay server-owned.
export const createInferenceModelProvider = (options = {}, capability = assistant) => ({
  getModel: () => ({
    getResponse: request => capability.chat(request, options),
    getStreamedResponse: request => capability.stream(request, options)
  })
});

export default createInferenceModelProvider();
