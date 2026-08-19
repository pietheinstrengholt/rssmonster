import { afterAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import db from '../../models/index.js';
import { resolveSemanticVectorFixturePath } from '../../utils/semanticVectorFixtures.js';
import { printSemanticArticleRankingTableForUser } from '../helpers/semanticRegressionReport.js';

const { User, Island } = db;

const VECTOR_FIXTURE_PATH = await resolveSemanticVectorFixturePath('semantic-regression');
const FIXTURE_USERNAME = 'semantic-regression-user';

// This function checks whether the semantic regression vector fixture is available.
async function hasVectorFixture() {
  try {
    await readFile(VECTOR_FIXTURE_PATH, 'utf8');
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

const semanticRegressionDescribe = (await hasVectorFixture()) ? describe : describe.skip;

semanticRegressionDescribe('semantic regression island architecture guard', () => {
  afterAll(async () => {
    await printSemanticArticleRankingTableForUser(FIXTURE_USERNAME, {
      includeIslands: false
    });
  });

  it('does not create islands during baseline article event topic assignment', async () => {
    const user = await User.findOne({
      where: { username: FIXTURE_USERNAME },
      attributes: ['id'],
      raw: true
    });

    expect(user, 'semantic regression baseline user should exist before island guard').toBeTruthy();

    const islandCount = await Island.count({ where: { userId: user.id } });

    expect(islandCount).toBe(0);
  });
});
