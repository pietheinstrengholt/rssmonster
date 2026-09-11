import provider from '../ai/providers/inference.js';
import { validateInferenceCapabilities } from '../ai/capabilities.js';
import { getEffectiveInferenceConfiguration, inferenceConfigurationIdentity, getTestInferenceConfiguration } from './configuration.js';
import { isInferenceEnabled } from '../../config/intelligentFeatures.js';

const TTL_MS = 15_000;
let cached;
export const clearInferenceStatus = () => { cached = undefined; };
const inspect = async (configuration, options) => {
  if (!configuration.baseUrl) return { state: 'not_configured', reachable: null, authenticated: null, ready: false, capabilities: null };
  if (!isInferenceEnabled()) return { state: 'disabled', reachable: null, authenticated: null, ready: false, capabilities: null };
  const requestOptions = { timeoutMs: 3000, ...options, configuration };
  const results = await Promise.allSettled([
    provider.getHealth(requestOptions), provider.getReadiness(requestOptions),
    provider.getCapabilities(requestOptions).then(validateInferenceCapabilities)
  ]);
  const [health, readiness, discovery] = results;
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
  const reachable = results.some(result => result.status === 'fulfilled' || Number.isInteger(result.reason?.status));
  const unauthorized = errors.some(error => error.code === 'INFERENCE_UNAUTHORIZED');
  const incompatible = errors.some(error => ['INFERENCE_CONTRACT_VERSION_UNSUPPORTED', 'INFERENCE_CONTRACT_INVALID'].includes(error.code));
  const ready = readiness.status === 'fulfilled' && readiness.value.ok && readiness.value.body?.state === 'ready' && readiness.value.body?.acceptingWork === true;
  const capabilities = !unauthorized && discovery.status === 'fulfilled' ? discovery.value.capabilities : null;
  const state = unauthorized ? 'unauthorized' : incompatible ? 'incompatible' : !reachable ? 'unreachable'
    : !capabilities ? 'invalid_contract' : !ready ? 'not_ready'
      : Object.values(capabilities).some(item => !item.available) ? 'partial' : 'ready';
  return { state, reachable, authenticated: unauthorized ? false : capabilities ? true : null, ready: Boolean(ready && capabilities && !unauthorized), capabilities,
    live: health.status === 'fulfilled' && health.value.ok };
};
// Draft probes bypass the effective-connection status cache.
export const testInferenceConfiguration = async (input, options = {}) => inspect(await getTestInferenceConfiguration(input), options);
export const getInferenceStatus = async ({ refresh = false, ...options } = {}) => {
  const configuration = await getEffectiveInferenceConfiguration();
  const identity = `${inferenceConfigurationIdentity(configuration)}:${isInferenceEnabled()}`;
  if (!refresh && cached?.identity === identity && cached.expires > Date.now()) return cached.promise;
  const promise = inspect(configuration, options);
  cached = { identity, expires: Date.now() + TTL_MS, promise };
  try { return await promise; } catch (error) { clearInferenceStatus(); throw error; }
};
export const getAvailableInferenceCapabilities = async (snapshot) => {
  try {
    const status = snapshot === undefined ? await getInferenceStatus() : snapshot;
    return Object.fromEntries(['embeddings', 'generation', 'classification', 'assistant'].map(name =>
      [name, Boolean(isInferenceEnabled() && status?.ready && status.capabilities?.[name]?.available)]));
  } catch { return { embeddings: false, generation: false, classification: false, assistant: false }; }
};
