// scripts/generateIslandTaxonomyVectors.js
/**
 * Reload island taxonomy entries from the seed file and generate vectors.
 *
 * Usage:
 *   npm run taxonomy:vectors
 *   npm run taxonomy:vectors -- --force
 *
 * Env:
 *   OPENAI_API_KEY=...
 *   OPENAI_EMBEDDING_MODEL=text-embedding-3-small (optional)
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import OpenAI from 'openai';
import db from '../models/index.js';

const { IslandTaxonomy, sequelize } = db;
const __dirname = dirname(fileURLToPath(import.meta.url));
const TAXONOMY_SEEDER_PATH = join(__dirname, '..', 'seeders', '20260520104500-island-taxonomy.js');

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
const openai = hasApiKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const buildEmbeddingInput = (row) =>
  `${row.categoryName} ${row.displayName}`.replace(/\s+/g, ' ').trim();

// This function loads the CommonJS taxonomy seeder from the ESM script runtime.
async function loadTaxonomySeeder() {
  const source = await readFile(TAXONOMY_SEEDER_PATH, 'utf8');
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    console
  });

  vm.runInContext(source, context, {
    filename: TAXONOMY_SEEDER_PATH
  });

  if (typeof module.exports?.up !== 'function') {
    throw new Error(`Taxonomy seeder ${TAXONOMY_SEEDER_PATH} does not export an up() function`);
  }

  return module.exports;
}

// This function clears and reloads island taxonomy rows from the seed file.
async function reloadIslandTaxonomyFromSeeder() {
  const seeder = await loadTaxonomySeeder();
  const queryInterface = sequelize.getQueryInterface();

  await IslandTaxonomy.destroy({
    where: {},
    truncate: true,
    cascade: true,
    force: true
  });

  await seeder.up(queryInterface, db.Sequelize);

  const count = await IslandTaxonomy.count();
  console.log(`[TAXONOMY-VECTORS] Reloaded taxonomy seed rows=${count}`);

  return count;
}

async function embedText(text) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text
  });

  return response.data[0].embedding;
}

export async function generateIslandTaxonomyVectors({ force = false } = {}) {
  if (!hasApiKey) {
    throw new Error('OPENAI_API_KEY is required before reloading taxonomy and generating vectors');
  }

  await sequelize.authenticate();
  const reloaded = await reloadIslandTaxonomyFromSeeder();

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
    reloaded,
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
