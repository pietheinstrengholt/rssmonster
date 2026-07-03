import { describe, expect, it } from 'vitest';

import {
  expectSemanticRegressionIslandsBuilt,
  hasTaxonomyVectorFixture
} from './helpers/semanticRegressionIslands.js';

const semanticRegressionDescribe = (await hasTaxonomyVectorFixture()) ? describe : describe.skip;

semanticRegressionDescribe('semantic regression island build command', () => {
  it('creates interest islands only when the island build runs', async () => {
    await expectSemanticRegressionIslandsBuilt(expect);
  }, 180000);
});
