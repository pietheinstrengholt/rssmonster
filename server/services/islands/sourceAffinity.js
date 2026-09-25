import db from '../../models/index.js';
import { bestPositiveIslandAffinity, EVIDENCE_LIMIT, loadIslandEvidence } from './islandInterestConfidence.js';
import { resolveIslandArticleScoreThreshold } from '../score/scoreArticlesFromIslands.js';

const { Article, Feed, sequelize, Sequelize: { Op, QueryTypes } } = db;
const FEED_BATCH_SIZE = 20;

export async function refreshSourceAffinityForUser(userId, { assertLease } = {}) {
  const context = await loadIslandEvidence(userId, { positiveOnly: true });
  const islands = context.islands.filter(island => island.preferenceStrength > 0);
  const threshold = resolveIslandArticleScoreThreshold();
  let afterId = 0;
  while (true) {
    await assertLease?.();
    const feeds = await Feed.findAll({ where: { userId, id: { [Op.gt]: afterId } },
      attributes: ['id'], order: [['id', 'ASC']], limit: FEED_BATCH_SIZE, raw: true });
    if (!feeds.length) break;
    afterId = feeds.at(-1).id;
    const feedIds = feeds.map(feed => feed.id);
    // One ranked read caps each source independently, including articles without vectors.
    const recent = islands.length ? await sequelize.query(`
      SELECT id, feedId FROM (
        SELECT id, feedId, ROW_NUMBER() OVER (PARTITION BY feedId ORDER BY createdAt DESC, id DESC) AS rankInFeed
        FROM articles
        WHERE userId = :userId AND feedId IN (:feedIds)
          AND filteredInd = 0 AND duplicateOfArticleId IS NULL
      ) ranked WHERE rankInFeed <= :limit`, {
      replacements: { userId, feedIds, limit: EVIDENCE_LIMIT }, type: QueryTypes.SELECT
    }) : [];
    const articles = recent.length ? await Article.findAll({ where: { userId, id: recent.map(row => row.id) },
      attributes: ['id', 'feedId', 'articleVector', 'embedding_model'], raw: true }) : [];
    const byFeed = new Map(feedIds.map(id => [id, { eligible: 0, matched: 0, strength: 0 }]));
    for (const article of articles) {
      const counts = byFeed.get(article.feedId);
      if (!counts) continue;
      counts.eligible++;
      const best = bestPositiveIslandAffinity(article, islands, threshold);
      if (best == null) continue;
      counts.matched++;
      counts.strength += best;
    }
    for (const feed of feeds) {
      const { eligible, matched, strength } = byFeed.get(feed.id);
      // No positive match gives no supported estimate, rather than a synthetic zero.
      const sourceAffinity = matched ? (matched / eligible) * (strength / matched) * (1 - Math.exp(-matched / 10)) : null;
      await Feed.update({ sourceAffinity }, { where: { id: feed.id, userId }, silent: true });
    }
  }
}
