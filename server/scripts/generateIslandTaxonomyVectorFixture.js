import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { embedTexts, getEmbeddingInfo } from '../services/embeddings/embeddingService.js';
import {
  loadSemanticVectorFixtureForModel,
  selectSemanticVectorModel
} from '../utils/semanticVectorFixtures.js';

dotenv.config({ quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEEDER_PATH = join(__dirname, '..', 'seeders', '20260520104500-island-taxonomy.js');
const BATCH_SIZE = Number.parseInt(process.env.TAXONOMY_FIXTURE_EMBED_BATCH_SIZE || '8', 10);

const toSlug = (value) =>
  value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const toIdentity = (categoryName, displayName) =>
  `${toSlug(categoryName)}-${toSlug(displayName)}`.slice(0, 100);

const buildEmbeddingInput = (row) =>
  `${row.categoryName} ${row.displayName}`.replace(/\s+/g, ' ').trim();

async function loadTaxonomyRows() {
  const source = await readFile(SEEDER_PATH, 'utf8');
  const pairPattern = /\[\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/g;
  const rows = [];
  let match;

  while ((match = pairPattern.exec(source)) !== null) {
    const [, categoryName, displayName] = match;
    rows.push({
      identity: toIdentity(categoryName, displayName),
      categoryName,
      displayName,
      description: null,
      status: 'active'
    });
  }

  if (!rows.length) {
    throw new Error(`No taxonomy rows found in ${SEEDER_PATH}`);
  }

  return rows;
}

async function loadExistingVectors(embeddingModel) {
  const { fixture, path } = await loadSemanticVectorFixtureForModel(
    'island-taxonomy',
    embeddingModel
  );
  return {
    path,
    vectors: new Map(
      (fixture?.taxonomy || []).map(row => [row.identity, row])
    )
  };
}

async function main() {
  const {
    provider: embeddingProvider,
    model: embeddingModel,
    dimensions: embeddingDimensions,
    task: embeddingTask = null
  } = await getEmbeddingInfo();
  await selectSemanticVectorModel({
    provider: embeddingProvider,
    model: embeddingModel,
    dimensions: embeddingDimensions,
    task: embeddingTask
  });
  const taxonomyRows = await loadTaxonomyRows();
  const { path: vectorFixturePath, vectors: existingVectors } = await loadExistingVectors(embeddingModel);
  const fixtureRows = [];

  for (let index = 0; index < taxonomyRows.length; index += BATCH_SIZE) {
    const batch = taxonomyRows.slice(index, index + BATCH_SIZE);
    const missing = batch.filter(row =>
      !Array.isArray(existingVectors.get(row.identity)?.vector) ||
      existingVectors.get(row.identity).vector.length === 0 ||
      existingVectors.get(row.identity).embeddingModel !== embeddingModel ||
      existingVectors.get(row.identity).embeddingTask !== embeddingTask
    );

    const generatedByIdentity = new Map();
    if (missing.length) {
      const response = await embedTexts(missing.map(buildEmbeddingInput));

      response.embeddings.forEach((vector, resultIndex) => {
        const row = missing[resultIndex];
        generatedByIdentity.set(row.identity, {
          ...row,
          embeddingModel: response.model,
          embeddingTask,
          vector
        });
      });
    }

    for (const row of batch) {
      const existing = existingVectors.get(row.identity);
      fixtureRows.push(
        generatedByIdentity.get(row.identity) || {
          ...row,
          embeddingModel: existing.embeddingModel,
          embeddingTask: existing.embeddingTask,
          vector: existing.vector
        }
      );
    }

    console.log(
      `[TAXONOMY FIXTURE] processed ${Math.min(index + BATCH_SIZE, taxonomyRows.length)}` +
      `/${taxonomyRows.length}`
    );
  }

  await writeFile(
    vectorFixturePath,
    JSON.stringify({
      embeddingProvider,
      embeddingModel,
      embeddingDimensions,
      embeddingTask,
      sourceSeeder: '20260520104500-island-taxonomy.js',
      taxonomy: fixtureRows
    }, null, 2) + '\n',
    'utf8'
  );

  console.log(`[TAXONOMY FIXTURE] wrote ${vectorFixturePath}`);
}

main().catch(err => {
  console.error('[TAXONOMY FIXTURE] failed:', err);
  process.exitCode = 1;
});
