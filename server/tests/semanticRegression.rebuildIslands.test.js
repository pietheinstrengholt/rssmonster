import { describe, expect, it } from 'vitest';

import {
  expectSemanticRegressionIslandsBuilt,
  hasTaxonomyVectorFixture
} from './helpers/semanticRegressionIslands.js';

const semanticRegressionDescribe = (await hasTaxonomyVectorFixture()) ? describe : describe.skip;

semanticRegressionDescribe('semantic regression island rebuild command', () => {
  it('refreshes interest islands when the island build runs again after recluster', async () => {
    await expectSemanticRegressionIslandsBuilt(expect);
  }, 180000);
});
