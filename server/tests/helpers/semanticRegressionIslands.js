import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Op } from 'sequelize';

import db from '../../models/index.js';
import { buildInterestIslandsForUser } from '../../services/islands/buildInterestIslands.js';

const {
  User,
  Article,
  Island,
  IslandTopic,
  IslandTaxonomy
} = db;

const __dirname = dirname(fileURLToPath(import.meta.url));
export const TAXONOMY_VECTOR_FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'island-taxonomy.vectors.json');
export const FIXTURE_USERNAME = 'semantic-regression-user';
export const SEMANTIC_FIXTURE_ISLAND_TOPIC_CONFIDENCE_THRESHOLD = 0.02;

// This function loads a JSON fixture from disk.
async function loadFixture(path) {
  const fixtureText = await readFile(path, 'utf8');
  return JSON.parse(fixtureText.replace(/^\uFEFF/, ''));
}

// This function loads taxonomy rows needed to enrich interest islands from topics.
async function loadIslandTaxonomyFixture(taxonomyVectorFixture) {
  await IslandTaxonomy.bulkCreate(
    taxonomyVectorFixture.taxonomy.map(row => ({
      identity: row.identity,
      categoryName: row.categoryName,
      displayName: row.displayName,
      description: row.description ?? null,
      status: row.status || 'active',
      vector: row.vector,
      embedding_model: row.embeddingModel || taxonomyVectorFixture.embeddingModel
    })),
    {
      updateOnDuplicate: [
        'categoryName',
        'displayName',
        'description',
        'status',
        'vector',
        'embedding_model',
        'updatedAt'
      ]
    }
  );

  return IslandTaxonomy.count({ where: { status: 'active' } });
}

// This function checks whether the taxonomy vector fixture is available.
export async function hasTaxonomyVectorFixture() {
  try {
    await readFile(TAXONOMY_VECTOR_FIXTURE_PATH, 'utf8');
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

// This function runs and validates the island build command for the semantic regression user.
export async function expectSemanticRegressionIslandsBuilt(expect) {
  const user = await User.findOne({
    where: { username: FIXTURE_USERNAME },
    attributes: ['id'],
    raw: true
  });

  expect(user, 'semantic regression user should exist before island build').toBeTruthy();

  const taxonomyVectorFixture = await loadFixture(TAXONOMY_VECTOR_FIXTURE_PATH);
  const taxonomyCount = await loadIslandTaxonomyFixture(taxonomyVectorFixture);
  const islandResult = await buildInterestIslandsForUser(user.id, {
    topicConfidenceThreshold: SEMANTIC_FIXTURE_ISLAND_TOPIC_CONFIDENCE_THRESHOLD
  });
  const [islandCount, islandTopicLinkCount, scoredArticleCount] = await Promise.all([
    Island.count({ where: { userId: user.id } }),
    IslandTopic.count({
      include: [{
        model: Island,
        required: true,
        attributes: [],
        where: { userId: user.id }
      }]
    }),
    Article.count({
      where: {
        userId: user.id,
        interestScore: { [Op.ne]: 0 }
      }
    })
  ]);

  expect(taxonomyCount).toBeGreaterThan(0);
  expect(islandResult.islandCount).toBeGreaterThan(0);
  expect(islandResult.enrichedIslandCount).toBeGreaterThan(0);
  expect(islandResult.islandTopicLinkCount).toBeGreaterThan(0);
  expect(islandCount).toBeGreaterThan(0);
  expect(islandTopicLinkCount).toBeGreaterThan(0);
  expect(scoredArticleCount).toBeGreaterThan(0);
}
