import db from '../../models/index.js';
import { explainArticleInterests } from '../score/scoreArticlesFromIslands.js';

// Only explain a stored score when current evidence reproduces it. Never invent an Island for fallback evidence.
export async function loadInterestIslandAttributions(userId, articles) {
  const positive = articles.filter(a => Number(a.interestScore) > 0);
  if (!positive.length) return new Map();
  const rows = await db.Article.findAll({ where: { userId, id: positive.map(a => a.id) }, raw: true,
    attributes: ['title', 'description', 'advertisementScore', 'aiAnalysisCompletedAt', 'advertisementScoreActionOverrideInd', 'id', 'articleVector', 'embedding_model', 'interestScore', 'positiveInd', 'negativeInd', 'favoriteInd', 'clickedAmount', 'attentionBucket'] });
  const { context, results } = await explainArticleInterests(userId, rows);
  const attributions = new Map();
  for (const article of rows) {
    const result = results.get(String(article.id));
    if (Math.abs(result.score - Number(article.interestScore)) > 0.00015) continue;
    const path = result.paths.find(p => p.contribution > 0);
    const island = context.islands.find(i => String(i.id) === String(path?.islandId));
    if (island) attributions.set(String(article.id), { id: island.id, name: island.label, label: island.label, generatedLabel: island.generatedLabel });
  }
  return attributions;
}

export default loadInterestIslandAttributions;
