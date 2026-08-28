import { createInferenceWorkQueue } from './inferenceWorkQueue.js';

export const LOCAL_INFERENCE_PRIORITIES = Object.freeze({
  embedding: 100,
  scoring: 20,
  generation: 10
});

// Serializes local model execution so pending embeddings win shared CPU/model resources.
const localInferenceQueue = createInferenceWorkQueue({
  concurrency: 1,
  maximumPending: 64
});

export const runLocalInference = (task, {
  priority,
  signal,
  requestId,
  operation
}) => localInferenceQueue.enqueue(task, {
  priority,
  signal,
  requestId,
  operation
});

export const getLocalInferenceQueueSnapshot = localInferenceQueue.getSnapshot;
