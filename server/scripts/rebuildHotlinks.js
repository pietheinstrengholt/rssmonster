/**
 * Rebuild hotlink indicators for articles
 *
 * This script:
 * - Iterates over all articles
 * - Normalizes each article URL
 * - Counts how often that URL appears in the Hotlink table
 *   (including versions with query parameters)
 * - Updates:
 *     - hotInd (0/1)
 *     - hotlinks (count)
 *
 * Safe to run multiple times.
 */

import db from '../models/index.js';
import normalizeUrl from '../util/normalizeUrl.js';
import { Op } from 'sequelize';

const { Article, Hotlink } = db;

async function rebuildHotlinks() {
  console.log('[HOTLINK] Rebuilding hotlink indicators...');

  // --------------------------------------------------
  // Reset hotlink indicators (clean slate)
  // --------------------------------------------------
  console.log('[HOTLINK] Resetting hotInd and hotlinks for all articles');

  await Article.update(
    {
      hotInd: 0,
      hotlinks: 0
    },
    {
      where: {} // update all rows
    }
  );

  // Fetch all articles with URLs
  const articles = await Article.findAll({
    attributes: ['id', 'url', 'userId'],
    raw: true
  });

  console.log(`[HOTLINK] Processing ${articles.length} articles`);

  for (const article of articles) {
    if (!article.url) continue;

    // Normalize article URL
    const normalizedUrl = normalizeUrl(article.url);

    // Count reverse links (exact match OR with query params)
    const hotlinkCount = await Hotlink.count({
      where: {
        userId: article.userId,
        [Op.or]: [
          { url: normalizedUrl },
          { url: { [Op.like]: `${normalizedUrl}?%` } }
        ]
      }
    });

    // Update article hotlink indicators
    await Article.update(
      {
        hotInd: hotlinkCount > 0 ? 1 : 0,
        hotlinks: hotlinkCount
      },
      {
        where: { id: article.id }
      }
    );
  }

  console.log('[HOTLINK] Hotlink rebuild completed');
}

// Run as standalone script
(async () => {
  try {
    await rebuildHotlinks();
    process.exit(0);
  } catch (err) {
    console.error('[HOTLINK] Rebuild failed:', err);
    process.exit(1);
  }
})();