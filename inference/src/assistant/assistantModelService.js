import { OpenAIProvider } from '@openai/agents';
import { getAssistantConfig } from '../config/config.js';
import { logInferenceDebug } from '../debug.js';

export const createAssistantModelService = ({
  environment = process.env,
  createProvider = apiKey => new OpenAIProvider({ apiKey })
} = {}) => {
  const config = getAssistantConfig(environment);
  let provider;

  const getProvider = () => {
    if (provider) return provider;
    if (!environment.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required');
    provider = createProvider(environment.OPENAI_API_KEY);
    return provider;
  };

  const getModel = () => getProvider().getModel(config.modelId);

  return Object.freeze({
    async respond({ request }) {
      const startedAt = Date.now();
      logInferenceDebug(`calling assistant provider=${config.provider} model=${config.modelId}`);
      const response = await (await getModel()).getResponse(request);
      logInferenceDebug(
        `completed assistant provider=${config.provider} model=${config.modelId} ` +
        `durationMs=${Date.now() - startedAt}`
      );
      return response;
    },
    async stream({ request }) {
      logInferenceDebug(`calling assistant-stream provider=${config.provider} model=${config.modelId}`);
      return (await getModel()).getStreamedResponse(request);
    }
  });
};

export default createAssistantModelService();
