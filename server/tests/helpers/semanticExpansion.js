import { readSemanticFixtureFile as readFile } from './semanticBatchFixtures.js';
import { createHash } from 'node:crypto';
import { buildArticleEventEmbeddingText } from '../../services/articles/embedArticle.js';
import { recommendationCoverage, interestPathMetrics } from './semanticRecommendationDiagnostics.js';

export const expansionFixture = JSON.parse(await readFile(new URL('../fixtures/semantic-regression-expansion.json', import.meta.url), 'utf8'));
export const hashExpansionInput = article => createHash('sha256').update(buildArticleEventEmbeddingText({
  title: article.title, description: article.description || '', contentText: article.contentOriginal || ''
})).digest('hex');
export const scenarioArticles = scenario => expansionFixture.articles.filter(a => a.regression.scenario === scenario.id);

export async function loadExpansionVectors() {
  const frozen = JSON.parse(await readFile(new URL('../fixtures/semantic-regression-expansion.vectors.json', import.meta.url), 'utf8'));
  if (frozen.articles.length !== expansionFixture.articles.length) throw new Error('Incomplete expansion vectors; run npm run fixture:semantic-vectors from server/');
  const vectors = new Map(frozen.articles.map(row => [row.sourceId, row]));
  for (const article of expansionFixture.articles) {
    const row = vectors.get(article.sourceId);
    if (row?.embeddingInputHash !== hashExpansionInput(article) || row.articleVector.length !== frozen.embeddingDimensions || !row.articleVector.every(Number.isFinite)) {
      throw new Error(`Stale or invalid expansion vector: ${article.sourceId}`);
    }
  }
  return { vectors, metadata: frozen };
}

// Required gold probes must remain visible even when the source unexpectedly joins an Island.
export function requiredBehavioralTransfers(result) {
  const training = new Map(result.rows.filter(a => a.regression.role === 'training').map(a => [a.regression.interestGroup, a]));
  const unassigned = new Set(result.evidence.fallbackEvidence.map(a => a.id));
  return result.rows.filter(a => a.regression.role === 'held-out' && a.regression.expectedEvidence === 'unassigned-behavior')
    .map(article => {
      const source = training.get(article.regression.interestGroup);
      return { article, source, unassigned: Boolean(source && unassigned.has(source.id)) };
    });
}

export function expansionMetrics(results) {
  const rows = results.flatMap(r => r.rows || []);
  return { 'Expansion articles': rows.length, Events: results.reduce((n, r) => n + (r.events?.length || 0), 0),
    Islands: results.reduce((n, r) => n + (r.evidence?.islands.length || 0), 0),
    'Eventless articles': rows.filter(r => !r.eventId).length,
    'Unassigned behavioral profiles': results.reduce((n, r) => n + (r.profiles?.summary?.unassignedBehavioralProfiles || 0), 0),
    ...recommendationCoverage(rows), ...interestPathMetrics(rows),
    'Explicit held-out articles': rows.filter(r => r.regression.role === 'held-out').length,
    'Explicit held-out positive': rows.filter(r => r.regression.role === 'held-out' && r.interestScore > 0).length,
    'Explicit held-out negative': rows.filter(r => r.regression.role === 'held-out' && r.interestScore < 0).length,
    'Explicit held-out neutral': rows.filter(r => r.regression.role === 'held-out' && r.interestScore === 0).length };
}
