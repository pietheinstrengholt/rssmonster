import { mkdir, writeFile } from 'node:fs/promises';
import { readSemanticFixtureFile as readFile } from './semanticBatchFixtures.js';
import { createHash } from 'node:crypto';
import db from '../../models/index.js';
import { buildArticleEventEmbeddingText } from '../../services/articles/embedArticle.js';
import { runIncrementalEventsForUser } from '../../services/reconcile/semanticPipelineScopes.js';

import { buildInterestIslandProfilesForUser } from '../../services/islands/islandArticleProfiles.js';
import { persistIslandProfilesForUser } from '../../services/islands/runIslandCalibration.js';
import { scoreArticlesFromIslandsForUser, explainArticleInterests } from '../../services/score/scoreArticlesFromIslands.js';
import { markDuplicateArticlesForUser } from '../../services/duplicates/articleDuplicates.js';
import { computeRecommended } from '../../services/recommendations/recommendedScore.js';
import { recommendationCoverage, interestPathMetrics } from './semanticRecommendationDiagnostics.js';

export const expansionFixture = JSON.parse(await readFile(new URL('../fixtures/semantic-regression-expansion.json', import.meta.url), 'utf8'));
export const expansionDirectory = new URL('../.semantic-regression/', import.meta.url);
export const hashExpansionInput = article => createHash('sha256').update(buildArticleEventEmbeddingText({
  title: article.title, description: article.description || '', contentText: article.contentOriginal || ''
})).digest('hex');
export const scenarioArticles = scenario => expansionFixture.articles.filter(a => a.regression.scenario === scenario.id);
export const meanVector = vectors => vectors[0].map((_, i) => vectors.reduce((sum, v) => sum + v[i], 0) / vectors.length);

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

export async function createExpansionUser(scenario) {
  const user = await db.User.create({ username: `semantic-expansion-${scenario.id}` });
  const category = await db.Category.create({ userId: user.id, name: 'Semantic expansion' });
  const feeds = await db.Feed.bulkCreate(expansionFixture.feeds.map(feed => ({ userId: user.id, categoryId: category.id,
    feedName: feed.feedName, url: feed.url, feedType: feed.feedType })));
  return { userId: user.id, feedIds: new Map(expansionFixture.feeds.map((feed, index) => [feed.id, feeds[index].id])) };
}

// URL/source keys distinguish syndicated records; content hashes must not discard copies during ingestion.
export async function insertExpansionArticles(context, articles, vectors) {
  const values = articles.map(article => ({ userId: context.userId, feedId: context.feedIds.get(article.feedId),
    url: article.url, title: article.title, description: article.description, contentOriginal: article.contentOriginal ?? null,
    contentText: article.contentOriginal ?? null, publishedAt: new Date(article.publishedAt), language: article.language,
    articleVector: vectors.get(article.sourceId).articleVector, embedding_model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
    status: 'unread', favoriteInd: article.favoriteInd || 0, negativeInd: article.negativeInd || 0,
    positiveInd: article.positiveInd || 0, clickedAmount: article.clickedAmount || 0,
    qualityScore: article.regression.role === 'training' ? 85 : 75,
    advertisementScore: /discount|promotion|deal/i.test(article.title) ? 15 : 85,
    sentimentScore: 70, aiAnalysisCompletedAt: new Date(article.publishedAt)
  }));
  const stored = [];
  for (const value of values) stored.push(await db.Article.create(value));
  return stored;
}

export async function processExpansionScenario(scenario, vectors, setClock) {
  const context = await createExpansionUser(scenario);
  const source = scenarioArticles(scenario);
  const finalTime = Math.max(...source.map(a => Date.parse(a.publishedAt))) + 60000;
  let profiles = [];
  const snapshots = [];
  if (scenario.kind === 'behavior') {
    setClock(finalTime);
    const training = source.filter(a => a.regression.role === 'training');
    await insertExpansionArticles(context, training, vectors);
    profiles = await buildInterestIslandProfilesForUser(context.userId, scenario.mode === 'capacity' ? { maxIslands: 3 } : {});
    await persistIslandProfilesForUser(context.userId, profiles);
    snapshots.push({ phase: 'formation', articleCount: await db.Article.count({ where: { userId: context.userId } }),
      memberIds: profiles.flatMap(p => p.articles.map(a => a.articleId)) });
    await insertExpansionArticles(context, source.filter(a => a.regression.role === 'held-out'), vectors);
  } else {
    for (const wave of [...new Set(source.map(a => a.regression.wave))].sort((a, b) => a - b)) {
      const incoming = source.filter(a => a.regression.wave === wave);
      const time = Math.max(...incoming.map(a => Date.parse(a.publishedAt))) + 60000;
      setClock(time);
      await insertExpansionArticles(context, incoming, vectors);
      if (scenario.kind === 'duplicate') await markDuplicateArticlesForUser(context.userId);
      const result = await runIncrementalEventsForUser(context.userId, { createdAtFrom: new Date(time - 1000) });
      snapshots.push({ phase: wave, ...result });
    }

  }
  setClock(finalTime);
  await scoreArticlesFromIslandsForUser(context.userId);
  const stored = await db.Article.findAll({ where: { userId: context.userId }, include: [{ model: db.Event, as: 'event' }], order: [['id', 'ASC']] });
  const { context: evidence, results } = await explainArticleInterests(context.userId, stored, { now: finalTime });
  const byUrl = new Map(source.map(a => [a.url, a]));
  const sourceOrder = new Map(source.map((a, i) => [a.sourceId, i]));
  const rows = stored.map(a => ({ ...a.get({ plain: true }), sourceId: byUrl.get(a.url).sourceId,
    regression: byUrl.get(a.url).regression, recommended: computeRecommended(a),
    recommendedEligible: a.status !== 'duplicate' && !a.filteredInd,
    interestDiagnostics: results.get(String(a.id)) })).sort((a, b) => sourceOrder.get(a.sourceId) - sourceOrder.get(b.sourceId));
  const events = await db.Event.findAll({ where: { userId: context.userId }, raw: true });
  return { ...context, source, rows, events, evidence, profiles, snapshots };
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

const safeRow = row => ({ sourceId: row.sourceId, title: row.title, eventId: row.eventId, status: row.status, duplicateOfArticleId: row.duplicateOfArticleId, role: row.regression.role,
  interestScore: row.interestScore, recommended: row.recommended, interestDiagnostics: row.interestDiagnostics });
export async function writeExpansionReport(results, checks, controlled, naturalTransfers = []) {
  await mkdir(expansionDirectory, { recursive: true });
  const mainUser = await db.User.findOne({ where: { username: 'semantic-regression-user' } });
  const mainCount = mainUser ? await db.Article.count({ where: { userId: mainUser.id } }) : 0;
  const metrics = expansionMetrics(results);
  const payload = { mainCorpusCount: mainCount, expansionCorpusCount: metrics['Expansion articles'],
    combinedCorpusCount: mainCount + metrics['Expansion articles'], metrics, checks, controlled, naturalTransfers,
    scenarios: results.map(r => ({ scenario: r.scenario.id, expected: r.scenario.expected,
      articles: r.rows.map(safeRow), islands: r.evidence.islands.map(i => ({ id: i.id,
        preferenceStrength: i.preferenceStrength, islandConfidence: i.islandConfidence, ...i.diagnostics })) })) };
  await writeFile(new URL('expansion-report.json', expansionDirectory), JSON.stringify(payload, null, 2) + '\n');
  const escape = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
  const lines = ['# Semantic expansion regression', '',
    `Main corpus: ${mainCount}; expansion: ${metrics['Expansion articles']}; combined: ${mainCount + metrics['Expansion articles']}.`, '',
    '| Metric | Value |', '| --- | ---: |', ...Object.entries(metrics).map(([k, v]) => `| ${k} | ${v} |`), '',
    '| Scenario | Assertion | Result | Classification | Details |', '| --- | --- | --- | --- | --- |',
    ...checks.map(c => `| ${c.scenario} | ${escape(c.label)} | ${c.pass ? 'PASS' : 'FAIL'} | ${c.pass ? '' : c.classification} | ${escape(c.details || '')} |`), '',
    '## Controlled held-out paths', '', '| Article | Expected | Score | Paths |', '| --- | --- | ---: | --- |',
    ...controlled.map(r => `| ${escape(r.title)} | ${r.expected} | ${r.score} | ${escape(JSON.stringify(r.paths))} |`), '',
    '## Frozen-Qwen unassigned-source transfer probes', '',
    'Each probe uses one genuinely unassigned behavioral source alone; the complete multi-preference aggregate is reported below. Effectively neutral permits at most 0.005 absolute interest; meaningful negative requires below -0.025. These are fixture expectations, not production thresholds.', '',
    '| Article | Behavioral source | Expected | Score |', '| --- | --- | --- | ---: |',
    ...naturalTransfers.map(r => `| ${escape(r.title)} | ${r.behavioralSource} | ${r.expected} | ${r.score} |`), '',
    '## Natural-vector Article outcomes', '', '| Scenario | Title | Event | Role | Interest | Recommended |', '| --- | --- | --- | --- | ---: | ---: |',
    ...results.flatMap(r => r.rows.map(a => `| ${r.scenario.id} | ${escape(a.title)} | ${a.eventId ?? 'Eventless'} | ${a.regression.role} | ${a.interestScore} | ${a.recommended} |`)), ''];
  await writeFile(new URL('expansion-report.md', expansionDirectory), lines.join('\n'));
  console.log('[EXPANSION REPORT]', JSON.stringify({ mainCount, ...metrics }));
  console.table(expansionFixture.scenarios.map(s => {
    const own = checks.filter(c => c.scenario === s.id);
    return { scenario: s.id, articles: scenarioArticles(s).length,
      result: own.length && own.every(c => c.pass) ? 'PASS' : 'FAIL', failures: own.filter(c => !c.pass).length };
  }));
}
