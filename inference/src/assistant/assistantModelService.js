import { OpenAIProvider } from '@openai/agents';
import { getAssistantConfig, getCompatibleClientOptions, getCompatibleApiKey } from '../config/config.js';
import { logInferenceDebug } from '../debug.js';

export const createAssistantModelService = ({
  environment = process.env,
  createProvider = (_apiKey, providerEnvironment) => new OpenAIProvider({
    ...getCompatibleClientOptions('ASSISTANT', providerEnvironment),
    useResponses: false
  })
} = {}) => {
  const config = getAssistantConfig(environment);
  let provider;

  const getProvider = () => {
    if (provider) return provider;
    const apiKey = getCompatibleApiKey('ASSISTANT', environment);
    if (!apiKey) throw new Error('ASSISTANT_API_KEY is required (legacy alias: OPENAI_API_KEY)');
    provider = createProvider(apiKey, environment);
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
