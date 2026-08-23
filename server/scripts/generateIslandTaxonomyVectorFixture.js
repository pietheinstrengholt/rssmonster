import crypto from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { embedTexts, getEmbeddingInfo } from '../services/embeddings/embeddingService.js';
import { buildTaxonomyEmbeddingText } from '../services/islands/taxonomyEmbeddingText.js';
import {
  loadSemanticVectorFixtureForModel,
  selectSemanticVectorModel
} from '../utils/semanticVectorFixtures.js';

dotenv.config({ quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEEDER_PATH = join(__dirname, '..', 'seeders', '20260520104500-island-taxonomy.js');
const BATCH_SIZE = Number.parseInt(process.env.TAXONOMY_FIXTURE_EMBED_BATCH_SIZE || '8', 10);
const require = createRequire(import.meta.url);
const { taxonomyItems, toIdentity } = require(SEEDER_PATH);

const hashEmbeddingInput = input =>
  crypto.createHash('sha256').update(input).digest('hex');

async function loadTaxonomyRows() {
  const rows = taxonomyItems.map(item => ({
    ...item,
    identity: toIdentity(item.categoryName, item.displayName),
    status: 'active'
  }));

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
    const batch = taxonomyRows.slice(index, index + BATCH_SIZE).map(row => {
      const embeddingInput = buildTaxonomyEmbeddingText(row);
      return {
        ...row,
        embeddingInput,
        embeddingInputHash: hashEmbeddingInput(embeddingInput)
      };
    });
    const missing = batch.filter(row => {
      const existing = existingVectors.get(row.identity);
      return !Array.isArray(existing?.vector) ||
        existing.vector.length === 0 ||
        existing.embeddingModel !== embeddingModel ||
        existing.embeddingTask !== embeddingTask ||
        existing.embeddingInputHash !== row.embeddingInputHash;
    });

    const generatedByIdentity = new Map();
    if (missing.length) {
      const response = await embedTexts(missing.map(row => row.embeddingInput));

      response.embeddings.forEach((vector, resultIndex) => {
        const row = missing[resultIndex];
        generatedByIdentity.set(row.identity, {
          ...row,
          embeddingInput: undefined,
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
          embeddingInput: undefined,
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
