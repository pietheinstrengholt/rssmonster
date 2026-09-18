import { AsyncLocalStorage } from 'node:async_hooks';
import { InferenceConfigurationError } from './configuration.js';

const snapshot = new AsyncLocalStorage();
const model = async () => (await import('../../models/index.js')).default.InferenceSetting;
const readOverrides = async () => (await (await model()).findByPk(1, { attributes: ['runtimeOverrides'], logging: false }))?.runtimeOverrides ?? null;

export const INFERENCE_RUNTIME_FIELDS = Object.freeze([
  { key: 'INFERENCE_TIMEOUT_MS', label: 'Request timeout', group: 'Timeouts and recovery', defaultValue: 30000, type: 'number', unit: 'ms' },
  { key: 'INFERENCE_AGENT_TIMEOUT_MS', label: 'Assistant timeout', group: 'Timeouts and recovery', defaultValue: 300000, type: 'number', unit: 'ms' },
  { key: 'INFERENCE_CIRCUIT_FAILURE_THRESHOLD', label: 'Circuit failure threshold', group: 'Timeouts and recovery', defaultValue: 5, type: 'number', help: 'Consecutive availability failures before opening the affected capability’s circuit.' },
  { key: 'INFERENCE_CIRCUIT_COOLDOWN_MS', label: 'Circuit cooldown', group: 'Timeouts and recovery', defaultValue: 30000, type: 'number', unit: 'ms', help: 'Minimum wait before allowing one recovery probe.' },
  { key: 'INFERENCE_AI_ENABLED', label: 'Allow inference', group: 'Permissions', defaultValue: null, type: 'permission', help: 'Automatic allows inference when an endpoint is configured. Disabled blocks all inference requests.' },
  { key: 'INFERENCE_ASSISTANT_ENABLED', label: 'Allow assistant', group: 'Permissions', defaultValue: null, type: 'permission', help: 'Automatic follows capability discovery. Enabled still requires inference permission and an available assistant.' },
  { key: 'SKIP_ARTICLE_CLASSIFICATION_ANALYSIS', label: 'Skip article classification', group: 'Processing', defaultValue: false, type: 'boolean', help: 'Skip generated summaries, tags, and classification scores without calling inference.' },
  { key: 'SKIP_ARTICLE_EMBEDDINGS', label: 'Skip article embeddings', group: 'Processing', defaultValue: false, type: 'boolean', help: 'Skip article vector generation. Other embedding workloads remain available.' },
  { key: 'SKIP_SEMANTIC_LABELING', label: 'Skip semantic labels', group: 'Processing', defaultValue: false, type: 'boolean', help: 'Skip generated Event and Island display labels.' }
].map(field => Object.freeze({ ...field, ...(field.type === 'number' ? { min: 1, max: 2_147_483_647 } : {}) })));

// Resolve on demand in every process. A batch scope shares one database read, not a global cache.
export const getInferenceEnvironment = async (environment = process.env) => {
  if (environment !== process.env) return environment;
  const scope = snapshot.getStore();
  const overrides = await (scope ? scope.overrides ??= readOverrides() : readOverrides());
  return { ...environment, ...Object.fromEntries(Object.entries(overrides || {}).map(([key, value]) => [key, value === null ? '' : String(value)])) };
};
export const withInferenceRuntimeSettings = operation => snapshot.getStore()
  ? operation() : snapshot.run({}, operation);

export const getInferenceRuntimeSettings = async () => {
  const overrides = await readOverrides();
  return { overridden: overrides !== null, fields: INFERENCE_RUNTIME_FIELDS.map(field => {
    const raw = process.env[field.key];
    const environmentValue = raw === undefined || raw === '' ? field.defaultValue
      : field.type === 'number' ? Number(raw) : String(raw).trim().toLowerCase() === 'true';
    return { ...field, value: overrides && Object.hasOwn(overrides, field.key) ? overrides[field.key] : environmentValue, environmentValue };
  }) };
};
export const saveInferenceRuntimeSettings = async input => {
  if (!input || typeof input.overridden !== 'boolean' || Object.keys(input).some(key => !['overridden', 'values'].includes(key))) throw new InferenceConfigurationError('Provide the inference override and its values');
  if (!input.overridden) {
    if (Object.hasOwn(input, 'values')) throw new InferenceConfigurationError('Inherited inference settings cannot include overrides');
    return clearInferenceRuntimeSettings();
  }
  const values = input.values;
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length !== INFERENCE_RUNTIME_FIELDS.length) throw new InferenceConfigurationError('Provide all inference runtime settings');
  for (const field of INFERENCE_RUNTIME_FIELDS) {
    const value = values[field.key];
    const valid = field.type === 'number' ? Number.isSafeInteger(value) && value >= field.min && value <= field.max
      : typeof value === 'boolean' || (field.type === 'permission' && value === null);
    if (!valid) throw new InferenceConfigurationError(`${field.key} must be ${field.type === 'number' ? `an integer between ${field.min} and ${field.max}` : field.type === 'permission' ? 'true, false, or automatic' : 'true or false'}`);
  }
  const Model = await model();
  const [row] = await Model.findOrCreate({ where: { id: 1 }, defaults: { baseUrl: '' } });
  await row.update({ runtimeOverrides: values }, { logging: false });
  return getInferenceRuntimeSettings();
};
export const clearInferenceRuntimeSettings = async () => {
  await (await model()).update({ runtimeOverrides: null }, { where: { id: 1 }, logging: false });
  return getInferenceRuntimeSettings();
};
