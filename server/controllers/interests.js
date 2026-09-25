import db from '../models/index.js';
import { canonicalArticleWhere } from '../services/duplicates/articleDuplicates.js';
import { isActiveIsland } from '../services/islands/islandDeadline.js';
import { islandSupportArticleIds } from '../services/islands/islandSupport.js';

const attributes = ['id', 'label', 'generatedLabel', 'weight', 'positiveSignals', 'lastBehaviorAt', 'archivedInd', 'mutedInd'];
const validInterestId = id => /^[1-9]\d{0,19}$/.test(id) && BigInt(id) <= 18446744073709551615n;

function presentInterest(island, now) {
  const weight = Number(island.weight);
  const signals = island.positiveSignals || {};
  return {
    id: island.id,
    name: island.generatedLabel?.trim() || island.label,
    polarity: weight > 0 ? 'positive' : weight < 0 ? 'negative' : 'neutral',
    weight,
    // Preference magnitude, not confidence or the probability of a match.
    evidenceStrength: Number((Math.min(1, Math.abs(weight)) * 100).toFixed(2)),
    lastActivityAt: island.lastBehaviorAt,
    lifecycle: isActiveIsland(island, now) ? 'active' : 'archived',
    muted: Boolean(island.mutedInd),
    ...(weight < 0
      ? (signals.negatives == null ? {} : { evidence: { negativeFeedback: signals.negatives } })
      : { evidence: { favorites: signals.stars ?? 0, clicks: signals.clicks ?? 0, deepReads: signals.deepReads ?? 0 } })
  };
}

async function list(req, res) {
  const { polarity = 'all', lifecycle = 'all', sort = 'strength', search = '' } = req.query;
  if (!['all', 'positive', 'negative'].includes(polarity)
    || !['all', 'active', 'archived'].includes(lifecycle)
    || !['strength', 'recent', 'name'].includes(sort) || typeof search !== 'string') {
    return res.status(400).json({ error: 'Invalid interest query' });
  }
  try {
    const rows = await db.Island.findAll({ where: { userId: req.userData.userId }, attributes, order: [['id', 'ASC']], raw: true });
    const now = Date.now();
    const summary = { total: rows.length, positive: 0, negative: 0, neutral: 0, active: 0, archived: 0 };
    const query = search.trim().toLocaleLowerCase();
    const interests = rows.map(row => {
      const interest = presentInterest(row, now);
      summary[interest.polarity]++;
      summary[interest.lifecycle]++;
      return { row, interest };
    }).filter(({ row, interest }) => (polarity === 'all' || interest.polarity === polarity)
      && (lifecycle === 'all' || interest.lifecycle === lifecycle)
      && [row.label, row.generatedLabel].some(label => label?.toLocaleLowerCase().includes(query)))
      .map(({ interest }) => interest);
    interests.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'strength') return Math.abs(b.weight) - Math.abs(a.weight);
      if (a.lastActivityAt == null) return b.lastActivityAt == null ? 0 : 1;
      if (b.lastActivityAt == null) return -1;
      return new Date(b.lastActivityAt) - new Date(a.lastActivityAt);
    });
    return res.json({ interests, summary });
  } catch (error) {
    console.error('Error listing interests:', error);
    return res.status(500).json({ error: 'Unable to load interests' });
  }
}

async function detail(req, res) {
  const { id } = req.params;
  if (!validInterestId(id)) {
    return res.status(400).json({ error: 'Invalid interest ID' });
  }
  try {
    const userId = req.userData.userId;
    const island = await db.Island.findOne({ where: { id, userId }, attributes: [...attributes, 'supportArticleIds'], raw: true });
    if (!island) return res.status(404).json({ error: 'Interest not found' });
    const ids = islandSupportArticleIds(island.supportArticleIds);
    const articles = ids.length ? await db.Article.findAll({
      where: { id: ids, userId, ...canonicalArticleWhere() },
      attributes: ['id', 'title', 'imageUrl', 'publishedAt'],
      include: [{ model: db.Feed, attributes: ['id', 'feedName'], where: { userId }, required: true }]
    }) : [];
    const byId = new Map(articles.map(article => [String(article.id), article.get({ plain: true })]));
    // Support is ordered by qualifying activity at calibration; retain that order after visibility checks.
    const representativeArticles = ids.map(id => byId.get(id)).filter(Boolean).slice(0, 3)
      .map(article => ({ id: article.id, title: article.title, imageUrl: article.imageUrl,
        publishedAt: article.publishedAt, feed: article.feed }));
    return res.json({ interest: { ...presentInterest(island, Date.now()), representativeArticles } });
  } catch (error) {
    console.error('Error loading interest:', error);
    return res.status(500).json({ error: 'Unable to load interest' });
  }
}

async function update(req, res) {
  const { id } = req.params;
  if (!validInterestId(id)) return res.status(400).json({ error: 'Invalid interest ID' });
  if (typeof req.body?.muted !== 'boolean') return res.status(400).json({ error: 'Invalid muted state' });
  const where = { id, userId: req.userData.userId };
  try {
    await db.Island.update({ mutedInd: req.body.muted }, { where });
    const island = await db.Island.findOne({ where, attributes, raw: true });
    if (!island) return res.status(404).json({ error: 'Interest not found' });
    return res.json({ interest: presentInterest(island, Date.now()) });
  } catch (error) {
    console.error('Error updating interest:', error);
    return res.status(500).json({ error: 'Unable to update interest' });
  }
}

export default { list, detail, update };
