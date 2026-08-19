// scripts/generateIslandTaxonomyVectors.js
/**
 * Reload island taxonomy entries from the seed file and generate vectors.
 *
 * Usage:
 *   npm run taxonomy:vectors
 *   npm run taxonomy:vectors -- --force
 *
 * Env:
 *   INFERENCE_URL=http://127.0.0.1:3001 (optional)
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import db from '../models/index.js';
import { embedTexts, getEmbeddingInfo } from '../services/embeddings/embeddingService.js';

const { IslandTaxonomy, sequelize } = db;
const __dirname = dirname(fileURLToPath(import.meta.url));
const TAXONOMY_SEEDER_PATH = join(__dirname, '..', 'seeders', '20260520104500-island-taxonomy.js');


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
  const response = await embedTexts([text]);
  return { vector: response.embeddings[0], model: response.model };
}

export async function generateIslandTaxonomyVectors({ force = false } = {}) {
  const { model: embeddingModel } = await getEmbeddingInfo();
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
      const { vector, model } = await embedText(input);

      await row.update({
        vector,
        embedding_model: model
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
    model: embeddingModel,
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
