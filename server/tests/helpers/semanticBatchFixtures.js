import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { resolveSemanticVectorFixturePath } from '../../utils/semanticVectorFixtures.js';

export const batchFixtureUrl = batch => new URL(`../fixtures/semantic-regression-batch${String(batch).padStart(3, '0')}.json`, import.meta.url);
export const loadSemanticBatch = async batch => JSON.parse(await readFile(batchFixtureUrl(batch), 'utf8'));

// Isolated gold tests reuse subsets of the two canonical batches. They retain their
// original chronology; the main simulation always uses the seven-day timestamps.
export async function loadSemanticFixtureSubset(name) {
  const batches = await Promise.all([loadSemanticBatch(1), loadSemanticBatch(2)]);
  const articles = batches.flatMap(b => b.articles).filter(a => a.regression.originFixture === name).sort((a, b) => a.regression.originalIndex - b.regression.originalIndex).map(article => {
    const copy = structuredClone(article);
    const r = copy.regression;
    copy.publishedAt = r.originalPublishedAt;
    copy.feedId = r.originalFeedId;
    if (r.originalFirstSeen) copy.firstSeen = r.originalFirstSeen;
    else delete copy.firstSeen;
    if (r.originalSourceId != null) copy.sourceId = r.originalSourceId;
    else delete copy.sourceId;
    if (r.originalDayOffset != null) r.dayOffset = r.originalDayOffset;
    else delete r.dayOffset;
    if (r.originalHourOffset != null) r.hourOffset = r.originalHourOffset;
    else delete r.hourOffset;
    if (r.originalWave != null) r.wave = r.originalWave;
    else delete r.wave;
    for (const key of Object.keys(r)) if (key.startsWith('original') && !key.startsWith('originally') || key === 'originFixture' || key === 'batch') delete r[key];
    if (!Object.keys(r).length) delete copy.regression;
    return copy;
  });
  const feedIds = new Set(articles.map(a => a.feedId));
  const currentFeeds = new Map(batches.flatMap(b => b.feeds).map(f => [f.id, f]));
  const feeds = [...new Map(batches.flatMap(b => b.articles).filter(a => a.regression.originFixture === name)
    .map(a => [a.regression.originalFeedId, { ...currentFeeds.get(a.feedId), id: a.regression.originalFeedId }])).values()]
    .filter(f => feedIds.has(f.id));
  return { schemaVersion: 1, categories: batches[0].categories, feeds, articles,
    scenarios: batches[1].expansionScenarios, longitudinalScenarios: batches[1].longitudinalScenarios };
}

// Generated vector caches are also projected, so focused tests need only the two batch caches.
async function loadSubsetVectors(name) {
  const batches = await Promise.all([loadSemanticBatch(1), loadSemanticBatch(2)]);
  let metadata;
  const articles = [];
  for (const [index, batch] of batches.entries()) {
    const cache = JSON.parse(await readFile(await resolveSemanticVectorFixturePath(`semantic-regression-batch00${index + 1}`), 'utf8'));
    metadata = cache;
    const byId = new Map(cache.articles.map(a => [a.fixtureSourceId, a]));
    for (const a of batch.articles) {
      const r = a.regression;
      const occurrence = ['semantic-regression', 'semantic-regression-incremental'].includes(r.originFixture)
        && r.scenario && !String(a.sourceId).startsWith('long-') && r.provenance !== 'real';
      if (name === 'semantic-regression-occurrences' ? !occurrence : r.originFixture !== name) continue;
      articles.push({ ...byId.get(a.sourceId), sourceId: r.originalSourceId, fixtureSourceId: r.originalSourceId });
    }
  }
  return { ...metadata, dimensions: metadata.embeddingDimensions, articles };
}

// Compatibility for focused gold readers only: no parallel article JSON inputs.
export async function readSemanticFixtureFile(path, encoding) {
  const name = basename(path instanceof URL ? path.pathname : String(path));
  if (['semantic-regression.json', 'semantic-regression-incremental.json', 'semantic-regression-expansion.json', 'semantic-regression-incremental.unread.json'].includes(name)) {
    return JSON.stringify(await loadSemanticFixtureSubset(name.slice(0, -5)));
  }
  const vectorName = name.match(/^(semantic-regression(?:-incremental(?:\.unread)?|-expansion|-occurrences)?)(?:\.onnx-community--Qwen3-Embedding-0\.6B-ONNX)?\.vectors\.json$/)?.[1];
  if (vectorName) return JSON.stringify(await loadSubsetVectors(vectorName));
  return readFile(path, encoding);
}
