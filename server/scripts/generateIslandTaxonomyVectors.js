// scripts/generateIslandTaxonomyVectors.js
/**
 * Generate vectors for island taxonomy entries.
 *
 * Usage:
 *   npm run taxonomy:vectors
 *   npm run taxonomy:vectors -- --force
 *
 * Env:
 *   OPENAI_API_KEY=...
 *   OPENAI_EMBEDDING_MODEL=text-embedding-3-small (optional)
 */

import OpenAI from 'openai';
import db from '../models/index.js';

const { IslandTaxonomy } = db;

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
const openai = hasApiKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const buildEmbeddingInput = (row) =>
  `${row.categoryName} ${row.displayName}`.replace(/\s+/g, ' ').trim();

async function embedText(text) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text
  });

  return response.data[0].embedding;
}

export async function generateIslandTaxonomyVectors({ force = false } = {}) {
  if (!hasApiKey) {
    throw new Error('OPENAI_API_KEY is required to generate taxonomy vectors');
  }

  const rows = await IslandTaxonomy.findAll({
    order: [['id', 'ASC']]
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!force && Array.isArray(row.vector) && row.vector.length) {
      skipped += 1;
      continue;
    }

    const input = buildEmbeddingInput(row);

    if (!input) {
      skipped += 1;
      continue;
    }

    try {
      const vector = await embedText(input);

      await row.update({
        vector,
        embedding_model: EMBEDDING_MODEL
      });

      updated += 1;

      console.log(
        `[TAXONOMY-VECTORS] Embedded id=${row.id} identity=${row.identity}`
      );
    } catch (err) {
      failed += 1;
      console.error(
        `[TAXONOMY-VECTORS] Failed id=${row.id} identity=${row.identity}:`,
        err.message
      );
    }
  }

  const result = {
    total: rows.length,
    updated,
    skipped,
    failed,
    model: EMBEDDING_MODEL,
    force
  };

  console.log('[TAXONOMY-VECTORS] Summary:', result);

  return result;
}

export default generateIslandTaxonomyVectors;

if (process.argv[1]?.includes('generateIslandTaxonomyVectors')) {
  const force = process.argv.includes('--force');

  generateIslandTaxonomyVectors({ force })
    .then(() => {
      console.log('[TAXONOMY-VECTORS] Done');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[TAXONOMY-VECTORS] Failed:', err);
      process.exit(1);
    });
}
