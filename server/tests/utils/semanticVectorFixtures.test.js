import { describe, expect, it } from 'vitest';

import {
  legacySemanticVectorFixturePath,
  semanticVectorFixturePath,
  semanticVectorModelSlug
} from '../../utils/semanticVectorFixtures.js';

describe('semantic vector fixture paths', () => {
  it('creates stable model-qualified filenames from arbitrary model IDs', () => {
    expect(semanticVectorModelSlug('onnx-community/Qwen3-Embedding-0.6B-ONNX'))
      .toBe('onnx-community--Qwen3-Embedding-0.6B-ONNX');
    expect(semanticVectorFixturePath('semantic-regression', 'organization/future model'))
      .toMatch(/semantic-regression\.organization--future-model\.vectors\.json$/);
  });

  it('retains the legacy path for fixture sets created before model qualification', () => {
    expect(legacySemanticVectorFixturePath('semantic-regression'))
      .toMatch(/semantic-regression\.vectors\.json$/);
  });
});
