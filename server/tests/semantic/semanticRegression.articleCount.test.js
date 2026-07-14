import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import db from '../../models/index.js';

const { User, Article } = db;
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_USERNAME = 'semantic-regression-user';
const FIXTURE_NAMES = [
  'semantic-regression.json',
  'semantic-regression-incremental.json',
  'semantic-regression-incremental.unread.json'
];
const VECTOR_FIXTURE_NAMES = [
  'semantic-regression.vectors.json',
  'semantic-regression-incremental.vectors.json',
  'semantic-regression-incremental.unread.vectors.json'
];

// This function resolves a semantic regression fixture path.
function fixturePath(fixtureName) {
  return join(__dirname, '..', 'fixtures', fixtureName);
}

// This function loads a semantic regression fixture from disk.
async function loadFixture(fixtureName) {
  const fixtureText = await readFile(fixturePath(fixtureName), 'utf8');
  return JSON.parse(fixtureText.replace(/^\uFEFF/, ''));
}

// This function checks whether all vector fixtures needed by the semantic pipeline are available.
async function hasVectorFixtures() {
  for (const fixtureName of VECTOR_FIXTURE_NAMES) {
    try {
      await readFile(fixturePath(fixtureName), 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  }

  return true;
}

const semanticRegressionDescribe = (await hasVectorFixtures()) ? describe : describe.skip;

semanticRegressionDescribe('semantic regression article count', () => {
  it('stores every article from all semantic regression fixture waves', async () => {
    const fixtures = await Promise.all(FIXTURE_NAMES.map(loadFixture));
    const expectedArticleCount = fixtures.reduce(
      (total, fixture) => total + fixture.articles.length,
      0
    );
    const user = await User.findOne({
      where: { username: FIXTURE_USERNAME },
      attributes: ['id'],
      raw: true
    });

    expect(user, 'semantic regression user must exist before the article count check').toBeTruthy();

    const storedArticleCount = await Article.count({ where: { userId: user.id } });

    expect(storedArticleCount).toBe(expectedArticleCount);
  });
});
