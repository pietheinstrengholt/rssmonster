import {
  AutoProcessor,
  Qwen3_5ForConditionalGeneration
} from '@huggingface/transformers';
import { getGenerationConfig } from '../../config/config.js';
import { configureModelCache } from '../../embeddings/modelCache.js';
import { logInferenceDebug } from '../../debug.js';
import { createInferenceWorkQueue } from '../../queue/inferenceWorkQueue.js';

const MODEL_DEVICE = 'cpu';
const QUEUE_EVENT_STAGES = Object.freeze({
  queued: 'queued',
  started: 'inference_started',
  completed: 'inference_completed',
  failed: 'inference_failed',
  aborted_pending: 'client_aborted_pending',
  aborted_running: 'client_aborted_running',
  rejected_full: 'overload_rejected'
});

const defaultDependencies = {
  configureCache: configureModelCache,
  loadProcessor: modelId => AutoProcessor.from_pretrained(modelId),
  loadModel: (modelId, dtype) => Qwen3_5ForConditionalGeneration.from_pretrained(modelId, {
    dtype: {
      embed_tokens: dtype,
      vision_encoder: dtype,
      decoder_model_merged: dtype
    },
    device: MODEL_DEVICE
  }),
  logger: console
};

export const createQwenGenerationProvider = ({
  environment = process.env,
  dependencies = defaultDependencies
} = {}) => {
  const config = getGenerationConfig({ ...environment, GENERATION_PROVIDER: 'qwen' });
  let processor;
  let model;
  let initializationPromise;
  const generationQueue = createInferenceWorkQueue({
    concurrency: 1,
    maximumPending: config.queueMaxPending,
    onEvent: event => {
      const message = [
        `generation-queue stage=${QUEUE_EVENT_STAGES[event.type] || event.type}`,
        `requestId=${JSON.stringify(event.requestId || 'unavailable')}`,
        `operation=${JSON.stringify(event.operation || 'qwen-generation')}`,
        `running=${event.running}`,
        `pending=${event.pending}`,
        ...(event.queueWaitMs === undefined ? [] : [`queueWaitMs=${event.queueWaitMs}`]),
        ...(event.executionMs === undefined ? [] : [`executionMs=${event.executionMs}`])
      ].join(' ');
      logInferenceDebug(message, { environment, logger: dependencies.logger });
    }
  });

  const initialize = async () => {
    if (processor && model) return;
    if (!initializationPromise) {
      initializationPromise = (async () => {
        dependencies.logger.log(`[INFERENCE] Loading generation model ${config.modelId}`);
        await dependencies.configureCache(environment);
        [processor, model] = await Promise.all([
          dependencies.loadProcessor(config.modelId),
          dependencies.loadModel(config.modelId, config.dtype)
        ]);
        dependencies.logger.log(`[INFERENCE] Loaded generation model ${config.modelId}`);
      })();
    }
    await initializationPromise;
  };

  const runGeneration = async ({ systemPrompt, prompt, maxNewTokens }) => {
    await initialize();
    const conversation = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];
    const text = processor.apply_chat_template(conversation, {
      add_generation_prompt: true
    });
    const inputs = await processor(text);
    const outputs = await model.generate({
      ...inputs,
      max_new_tokens: maxNewTokens,
      do_sample: false
    });
    return processor.batch_decode(
      outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
      { skip_special_tokens: true }
    )[0];
  };

  const generate = ({ signal, requestId, operation, ...input }) => generationQueue.enqueue(
    () => runGeneration(input),
    { signal, requestId, operation }
  );

  return Object.freeze({
    initialize,
    generate,
    getQueueSnapshot: generationQueue.getSnapshot,
    getMetadata: () => Object.freeze({
      provider: 'qwen',
      modelId: config.modelId,
      dtype: config.dtype,
      device: MODEL_DEVICE,
      task: 'text-generation'
    }),
    isLoaded: () => Boolean(processor && model)
  });
};

export default createQwenGenerationProvider();
