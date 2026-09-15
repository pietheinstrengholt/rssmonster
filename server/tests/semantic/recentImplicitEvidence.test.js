import { describe, expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadSemanticBatch } from '../helpers/semanticBatchFixtures.js';
import { resolveSemanticVectorFixturePath } from '../../utils/semanticVectorFixtures.js';
import { prepareIslandEvidence, evaluateArticleInterest } from '../../services/islands/islandInterestConfidence.js';

// Isolated clock intervention on the frozen corpus; never rewrite fixtures or vectors.
describe('recent implicit held-out transfer with frozen embeddings', () => {
  it('transfers weak recent engagement to independent technical articles and leaves unrelated news neutral', async () => {
    const [first, second] = await Promise.all([loadSemanticBatch(1), loadSemanticBatch(2)]);
    const vectors = await Promise.all([1, 2].map(async batch => JSON.parse(await readFile(
      await resolveSemanticVectorFixturePath(`semantic-regression-batch00${batch}`), 'utf8'))));
    expect(vectors[0].embeddingModel).toBe(vectors[1].embeddingModel);
    const byId = new Map(vectors.flatMap(fixture => fixture.articles.map(a => [a.fixtureSourceId,
      { articleVector: a.articleVector, embedding_model: a.embeddingModel || fixture.embeddingModel }])));
    const sourceFixture = first.articles.find(a => a.sourceId === 'long-local-inference-baseline-193');
    const targets = second.articles.filter(a => a.regression.role === 'held-out'
      && (a.regression.scenario === 'local-inference' || a.sourceId === 'capacity-and-intent-35'));
    expect(sourceFixture).toBeDefined();
    expect(targets.length).toBeGreaterThan(1);
    expect(targets.some(a => a.regression.expectedInterest === 'neutral')).toBe(true);
    const now = Date.parse('2026-09-15T12:00:00Z');
    const records = [];
    for (const type of ['click', 'deep-read']) {
      const source = { ...sourceFixture, ...byId.get(sourceFixture.sourceId), id: sourceFixture.sourceId,
        positiveInd: 0, favoriteInd: 0, negativeInd: 0, clickedAmount: type === 'click' ? 1 : 0,
        attentionBucket: type === 'deep-read' ? 3 : 0, lastClickedAt: new Date(now), lastMeaningfulReadAt: new Date(now) };
      const context = { ...prepareIslandEvidence([], [source]), now };
      for (const fixture of targets) {
        const candidate = { ...fixture, ...byId.get(fixture.sourceId), id: fixture.sourceId,
          positiveInd: 0, favoriteInd: 0, negativeInd: 0, clickedAmount: 0, attentionBucket: 0 };
        expect(candidate.id).not.toBe(source.id);
        expect(candidate.articleVector).toBeDefined();
        const result = evaluateArticleInterest(candidate, context);
        expect(result.seedSelf).toBe(false);
        if (fixture.regression.expectedInterest === 'neutral') expect(result.score).toBe(0);
        else {
          expect(result.score).toBeGreaterThan(0);
          expect(result.score).toBeLessThanOrEqual(type === 'click' ? 0.05 : 0.10);
          expect(result.paths[0]).toMatchObject({ matchType: 'implicit-behavior', implicitType: type, seedSelf: false });
        }
        expect(evaluateArticleInterest(candidate, { ...context, now: now + 8 * 86400000 }).score).toBe(0);
        records.push({ sourceId: source.id, targetId: candidate.id, title: candidate.title, type, ...result });
      }
    }
    const directory = new URL('../.semantic-regression/comparisons/recent-implicit-evidence/', import.meta.url);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL('implicit-held-out.json', directory), JSON.stringify({ model: vectors[0].embeddingModel,
      intervention: 'One existing training Article receives a synthetic recent click or deep-read timestamp; no Islands. Frozen content, candidate set and vectors are unchanged.', records }, null, 2));
  });
});
