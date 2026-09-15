import { describe, expect, it } from 'vitest';
import { aggregateEmbeddingModel, compatibleEmbeddingModels, embeddingSimilarity } from '../../services/vectors/embeddingModel.js';

describe('embedding-space compatibility', () => {
  it.each([null, undefined, '', ' ', 'model-b', 'MODEL-A'])('rejects identical vectors with incompatible provenance: %s', model => {
    expect(compatibleEmbeddingModels('model-a', model)).toBe(false);
    expect(embeddingSimilarity([1, 0], [1, 0], 'model-a', model)).toBe(-Infinity);
    expect(aggregateEmbeddingModel([
      { vector: [1, 0], embedding_model: 'model-a' }, { vector: [1, 0], embedding_model: model }
    ])).toBeNull();
  });
  it('rejects two unknown models and mismatched dimensions even at negative thresholds', () => {
    expect(embeddingSimilarity([1, 0], [1, 0], null, null)).toBeLessThan(-1);
    expect(embeddingSimilarity([1, 0], [1, 0, 0], 'model-a', 'model-a')).toBeLessThan(-1);
  });
  it('preserves compatible numerical comparisons, including serialized vectors', () => {
    expect(embeddingSimilarity('[1,0]', '[1,0]', 'model-a', 'model-a', { parseStrings: true })).toBe(1);
  });
});
