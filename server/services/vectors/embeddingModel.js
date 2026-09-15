import { cosineSimilarity } from './similarity.js';
import { parseVector } from './parseVector.js';

export const hasEmbeddingModel = model => typeof model === 'string' && model.trim().length > 0;

// Equal dimensions alone do not establish a shared coordinate system.
export const compatibleEmbeddingModels = (left, right) => hasEmbeddingModel(left) && left === right;

// Rejection must remain below even a zero or negative similarity threshold.
export function embeddingSimilarity(a, b, modelA, modelB, options = {}) {
  if (!compatibleEmbeddingModels(modelA, modelB)) return -Infinity;
  const left = options.parseStrings ? parseVector(a) : a;
  const right = options.parseStrings ? parseVector(b) : b;
  if (!Array.isArray(left) || !Array.isArray(right) || !left.length || left.length !== right.length) return -Infinity;
  const similarity = cosineSimilarity(left, right, options);
  return Number.isFinite(similarity) ? similarity : -Infinity;
}

// Never combine vectors whose provenance or dimensions disagree.
export function aggregateEmbeddingModel(samples = []) {
  const usable = samples.filter(sample => Array.isArray(sample.vector) && sample.vector.length);
  if (!usable.length) return null;
  const first = usable[0];
  return usable.every(sample => compatibleEmbeddingModels(first.embedding_model, sample.embedding_model)
    && sample.vector.length === first.vector.length) ? first.embedding_model : null;
}
