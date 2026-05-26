import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config({ quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEEDER_PATH = join(__dirname, '..', 'seeders', '20260520104500-island-taxonomy.js');
const VECTOR_FIXTURE_PATH = join(__dirname, '..', 'tests', 'fixtures', 'island-taxonomy.vectors.json');
const EMBEDDING_MODEL = process.env.TAXONOMY_FIXTURE_EMBEDDING_MODEL ||
  process.env.OPENAI_EMBEDDING_MODEL ||
  'text-embedding-3-small';
const BATCH_SIZE = Number.parseInt(process.env.TAXONOMY_FIXTURE_EMBED_BATCH_SIZE || '50', 10);

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

async function loadExistingVectors() {
  try {
    const vectorFixture = await readFile(VECTOR_FIXTURE_PATH, 'utf8').then(JSON.parse);
    return new Map(
      vectorFixture.taxonomy.map(row => [row.identity, row])
    );
  } catch (err) {
    if (err.code === 'ENOENT') return new Map();
    throw err;
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to generate taxonomy vector fixtures.');
  }

  const taxonomyRows = await loadTaxonomyRows();
  const existingVectors = await loadExistingVectors();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const fixtureRows = [];

  for (let index = 0; index < taxonomyRows.length; index += BATCH_SIZE) {
    const batch = taxonomyRows.slice(index, index + BATCH_SIZE);
    const missing = batch.filter(row =>
      !Array.isArray(existingVectors.get(row.identity)?.vector) ||
      existingVectors.get(row.identity).vector.length === 0 ||
      existingVectors.get(row.identity).embeddingModel !== EMBEDDING_MODEL
    );

    const generatedByIdentity = new Map();
    if (missing.length) {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: missing.map(buildEmbeddingInput)
      });

      response.data.forEach((result, resultIndex) => {
        const row = missing[resultIndex];
        generatedByIdentity.set(row.identity, {
          ...row,
          embeddingModel: EMBEDDING_MODEL,
          vector: result.embedding
        });
      });
    }

    for (const row of batch) {
      const existing = existingVectors.get(row.identity);
      fixtureRows.push(
        generatedByIdentity.get(row.identity) || {
          ...row,
          embeddingModel: existing.embeddingModel,
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
    VECTOR_FIXTURE_PATH,
    JSON.stringify({
      embeddingModel: EMBEDDING_MODEL,
      sourceSeeder: '20260520104500-island-taxonomy.js',
      taxonomy: fixtureRows
    }, null, 2) + '\n',
    'utf8'
  );

  console.log(`[TAXONOMY FIXTURE] wrote ${VECTOR_FIXTURE_PATH}`);
}

main().catch(err => {
  console.error('[TAXONOMY FIXTURE] failed:', err);
  process.exitCode = 1;
});
