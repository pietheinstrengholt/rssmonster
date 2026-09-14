import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolveSemanticVectorFixturePath } from '../../utils/semanticVectorFixtures.js';
import { semanticBatchEmbeddingText } from '../helpers/semanticBatchEmbeddingText.js';
import { describe, it, expect } from 'vitest';
import { loadSemanticBatch, loadSemanticFixtureSubset } from '../helpers/semanticBatchFixtures.js';

describe('two canonical semantic batches', () => {
  it('retains controlled scenarios and real content in exactly 2,000 unique articles', async () => {
    const batches = await Promise.all([loadSemanticBatch(1), loadSemanticBatch(2)]);
    const articles = batches.flatMap(b => b.articles);
    const byId = new Map(articles.map(a => [a.sourceId, a]));
    expect(batches.map(b => b.articles.length)).toEqual([1000, 1000]);
    expect(byId.size).toBe(2000);
    expect(new Set(articles.map(a => a.url)).size).toBe(2000);
    expect(articles.filter(a => a.regression.provenance === 'real')).toHaveLength(250);
    expect(articles.filter(a => a.regression.originFixture === 'semantic-regression-expansion')).toHaveLength(226);
    expect(articles.filter(a => a.regression.originFixture === 'semantic-regression-incremental.unread')).toHaveLength(1);
    for (const scenario of batches[1].longitudinalScenarios) {
      for (const id of [...(scenario.baseline || []), ...(scenario.follow || []), ...(scenario.later || []),
        ...(scenario.held || []), ...(scenario.members || []), ...(scenario.groups || []).flat()]) {
        expect(byId.get(id)?.regression.scenario, id).toBe(scenario.id);
      }
    }
    for (const batch of batches) {
      const feeds = new Set(batch.feeds.map(f => f.id));
      expect(batch.articles.every(a => feeds.has(a.feedId))).toBe(true);
      for (const field of ['favoriteInd', 'negativeInd', 'clickedAmount']) expect(batch.articles.some(a => a[field] > 0)).toBe(true);
    }
    const held = articles.filter(a => a.regression.heldOut || a.regression.role === 'held-out');
    expect(held).toHaveLength(160);
    expect(held.every(a => a.regression.batch === 2 && !a.favoriteInd && !a.negativeInd && !a.clickedAmount)).toBe(true);
  });

  it('keeps each cached vector bound to its unchanged semantic input', async () => {
    for (const batch of [1, 2]) {
      const fixture = await loadSemanticBatch(batch);
      const cache = JSON.parse(await readFile(await resolveSemanticVectorFixturePath(`semantic-regression-batch00${batch}`), 'utf8'));
      const byId = new Map(cache.articles.map(a => [a.fixtureSourceId, a]));
      expect(byId.size).toBe(1000);
      for (const article of fixture.articles) {
        const vector = byId.get(article.sourceId);
        expect(vector, article.sourceId).toBeTruthy();
        expect(vector.embeddingInputHash, article.sourceId).toBe(createHash('sha256').update(semanticBatchEmbeddingText(article)).digest('hex'));
        expect(vector.articleVector).toHaveLength(cache.embeddingDimensions);
        expect(vector.articleVector.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('uses one week with batch001 publications preceding batch002', async () => {
    const batches = await Promise.all([loadSemanticBatch(1), loadSemanticBatch(2)]);
    const times = batches.map(b => b.articles.map(a => Date.parse(a.publishedAt)));
    expect(times.flat().every(Number.isFinite)).toBe(true);
    expect(Math.max(...times[0])).toBeLessThan(Math.min(...times[1]));
    expect(Math.max(...times[1]) - Math.min(...times[0])).toBeLessThan(7 * 86400000);
  });

  it('derives isolated gold subsets from batches without rewriting their original chronology', async () => {
    const expansion = await loadSemanticFixtureSubset('semantic-regression-expansion');
    expect(expansion.articles).toHaveLength(226);
    expect(expansion.scenarios).toHaveLength(43);
    expect(expansion.articles.every(a => !a.regression.batch && !a.regression.originFixture)).toBe(true);
    const source = (await loadSemanticBatch(1)).articles.find(a => a.regression.provenance === 'real');
    const real = (await loadSemanticFixtureSubset('semantic-regression-incremental')).articles.find(a => a.sourceId === source.regression.originalSourceId);
    expect(real.publishedAt).toBe(source.regression.originalPublishedAt);
    expect(real.contentOriginal).toBe(source.contentOriginal);
  });
});
