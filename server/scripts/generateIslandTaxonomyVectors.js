// scripts/generateIslandTaxonomyVectors.js
/**
 * Synchronize island taxonomy entries from the seed file and generate vectors.
 *
 * Usage:
 *   npm run taxonomy:vectors
 *   npm run taxonomy:vectors -- --force
 *
 * Env:
 *   INFERENCE_URL=http://127.0.0.1:3001 (optional)
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../models/index.js';
import { embedTexts, getEmbeddingInfo } from '../services/embeddings/embeddingService.js';
import { buildTaxonomyEmbeddingText } from '../services/islands/taxonomyEmbeddingText.js';

const { IslandTaxonomy, Sequelize, sequelize } = db;
const __dirname = dirname(fileURLToPath(import.meta.url));
const TAXONOMY_SEEDER_PATH = join(__dirname, '..', 'seeders', '20260520104500-island-taxonomy.js');
const require = createRequire(import.meta.url);
const {
  deprecatedTaxonomyIdentities,
  taxonomyItems,
  toIdentity
} = require(TAXONOMY_SEEDER_PATH);
const taxonomyItemsByIdentity = new Map(
  taxonomyItems.map(item => [toIdentity(item.categoryName, item.displayName), item])
);

// Synchronizes seed metadata, replacing all rows first only for a forced rebuild.
async function syncIslandTaxonomyFromSeeder({ force = false } = {}) {
  return sequelize.transaction(async transaction => {
    if (force) {
      const deleted = await IslandTaxonomy.destroy({ where: {}, transaction });
      console.log(`[TAXONOMY-VECTORS] Cleared taxonomy rows=${deleted}`);
    }

    const existingRows = force
      ? []
      : await IslandTaxonomy.findAll({ transaction });
    const rowsByIdentity = new Map(existingRows.map(row => [row.identity, row]));

    for (const item of taxonomyItems) {
      const identity = toIdentity(item.categoryName, item.displayName);
      const existing = rowsByIdentity.get(identity);

      if (!existing) {
        await IslandTaxonomy.create({
          identity,
          displayName: item.displayName,
          categoryName: item.categoryName,
          description: item.description,
          vector: null,
          embedding_model: null,
          status: 'active'
        }, { transaction });
        continue;
      }

      const metadataChanged = existing.displayName !== item.displayName
        || existing.categoryName !== item.categoryName
        || existing.description !== item.description;
      if (!metadataChanged) continue;

      await existing.update({
        displayName: item.displayName,
        categoryName: item.categoryName,
        description: item.description,
        vector: null,
        embedding_model: null
      }, { transaction });
    }

    if (deprecatedTaxonomyIdentities.length) {
      await IslandTaxonomy.destroy({
        where: { identity: { [Sequelize.Op.in]: deprecatedTaxonomyIdentities } },
        transaction
      });
    }

    const count = await IslandTaxonomy.count({ transaction });
    console.log(`[TAXONOMY-VECTORS] Synchronized taxonomy seed rows=${count}`);
    return count;
  });
}

async function embedText(text) {
  const response = await embedTexts([text]);
  return { vector: response.embeddings[0], model: response.model };
}

export async function generateIslandTaxonomyVectors({ force = false } = {}) {
  const { model: embeddingModel } = await getEmbeddingInfo();
  await sequelize.authenticate();
  const synchronized = await syncIslandTaxonomyFromSeeder({ force });

  const rows = await IslandTaxonomy.findAll({
    order: [['id', 'ASC']]
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (
      !force &&
      Array.isArray(row.vector) &&
      row.vector.length &&
      row.embedding_model === embeddingModel
    ) {
      skipped += 1;
      continue;
    }

    const definition = taxonomyItemsByIdentity.get(row.identity);
    const input = buildTaxonomyEmbeddingText({
      categoryName: row.categoryName,
      displayName: row.displayName,
      description: row.description,
      aliases: definition?.aliases
    });

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
    synchronized,
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
