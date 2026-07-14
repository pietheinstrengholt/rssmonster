import { afterAll, describe, expect, it } from 'vitest';

import db from '../../models/index.js';
import {
  expectSemanticRegressionIslandsBuilt,
  FIXTURE_USERNAME,
  hasTaxonomyVectorFixture
} from '../helpers/semanticRegressionIslands.js';
import { printSemanticArticleRankingTableForUser } from '../helpers/semanticRegressionReport.js';
import {
  printSemanticRegressionTrace,
  refreshSemanticRegressionTrace
} from '../helpers/semanticRegressionTrace.js';

const { User } = db;

const semanticRegressionDescribe = (await hasTaxonomyVectorFixture()) ? describe : describe.skip;

semanticRegressionDescribe('semantic regression island creation command', () => {
  afterAll(async () => {
    await printSemanticArticleRankingTableForUser(FIXTURE_USERNAME);
  });

  it('creates interest islands after topics are created', async () => {
    await expectSemanticRegressionIslandsBuilt(expect);

    const user = await User.findOne({
      where: { username: FIXTURE_USERNAME },
      attributes: ['id'],
      raw: true
    });

    await refreshSemanticRegressionTrace({
      userId: user.id,
      phase: 'baseline-islands'
    });
    await printSemanticRegressionTrace({
      userId: user.id,
      phase: 'baseline-islands'
    });
  }, 180000);
});
