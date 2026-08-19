import {
  AutoProcessor,
  Qwen3_5ForConditionalGeneration
} from '@huggingface/transformers';
import { getGenerationConfig } from '../../config/config.js';
import { configureModelCache } from '../../embeddings/modelCache.js';

const MODEL_DEVICE = 'cpu';

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
  let generationQueue = Promise.resolve();

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

  const generate = input => {
    const result = generationQueue.then(() => runGeneration(input));
    generationQueue = result.catch(() => {});
    return result;
  };

  return Object.freeze({
    initialize,
    generate,
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
