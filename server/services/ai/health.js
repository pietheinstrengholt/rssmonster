import provider from './providers/inference.js';
import { getAIPermissions, createInferenceCapabilities } from './capabilities.js';
import { isInferenceEnabled } from '../../config/intelligentFeatures.js';

const states = new Set(['starting', 'ready', 'failed', 'shutting_down']);

export const createAIHealth = (inference = provider, environment = process.env) => async (options = {}) => {
  const configured = getAIPermissions(environment);
  const unavailable = Object.fromEntries(Object.keys(configured).map(key => [key, false]));
  if (!isInferenceEnabled(environment)) {
    return { enabled: false, reachable: null, ready: false, state: 'disabled', configured, capabilities: unavailable };
  }
  const requestOptions = { timeoutMs: 3000, ...options };
  const [health, readiness, discovery] = await Promise.allSettled([
    inference.getHealth(requestOptions), inference.getReadiness(requestOptions),
    createInferenceCapabilities(inference)(requestOptions)
  ]);
  const responses = [health, readiness];
  const receivedHttp = responses.some(result => result.status === 'fulfilled' || Number.isInteger(result.reason?.status));
  const attempted = responses.some(result => result.status === 'fulfilled' || result.reason?.code !== 'INFERENCE_CIRCUIT_OPEN');
  const reachable = receivedHttp ? true : attempted ? false : null;
  const status = readiness.status === 'fulfilled' ? readiness.value : null;
  const ready = Boolean(status?.ok && status.body?.state === 'ready' && status.body?.acceptingWork === true);
  const state = states.has(status?.body?.state) ? status.body.state : 'unknown';
  return {
    enabled: true, reachable, ready, state, configured,
    capabilities: Object.fromEntries(Object.entries(configured).map(([key, enabled]) =>
      [key, Boolean(enabled && ready && discovery.status === 'fulfilled' && discovery.value.capabilities[key].available)]))
  };
};

export const getAIHealth = createAIHealth();
export default getAIHealth;
