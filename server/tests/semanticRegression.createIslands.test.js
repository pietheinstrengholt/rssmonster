import { afterAll, describe, expect, it } from 'vitest';

import {
  expectSemanticRegressionIslandsBuilt,
  FIXTURE_USERNAME,
  hasTaxonomyVectorFixture
} from './helpers/semanticRegressionIslands.js';
import { printSemanticArticleRankingTableForUser } from './helpers/semanticRegressionReport.js';

const semanticRegressionDescribe = (await hasTaxonomyVectorFixture()) ? describe : describe.skip;

semanticRegressionDescribe('semantic regression island creation command', () => {
  afterAll(async () => {
    await printSemanticArticleRankingTableForUser(FIXTURE_USERNAME);
  });

  it('creates interest islands after topics are created', async () => {
    await expectSemanticRegressionIslandsBuilt(expect);
  }, 180000);
});
