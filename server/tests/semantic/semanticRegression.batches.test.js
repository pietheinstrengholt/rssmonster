import { articleRecords } from '../../services/articles/articleRecords.js';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import db from '../../models/index.js';
import { computeRecommended } from '../../services/recommendations/recommendedScore.js';
import { resolveSemanticVectorFixturePath } from '../../utils/semanticVectorFixtures.js';
import { runIncrementalEventsForUser } from '../../services/reconcile/semanticPipelineScopes.js';
import { runIslandCalibrationForUser } from '../../services/islands/runIslandCalibration.js';
import { DEFAULT_MAX_ISLANDS_PER_USER } from '../../services/islands/islandVectorUtils.js';
import scoreArticlesFromIslandsForUser, { explainArticleInterests } from '../../services/score/scoreArticlesFromIslands.js';
import { loadSemanticBatch } from '../helpers/semanticBatchFixtures.js';
import { buildVectorMap, insertMissingFixtureArticles } from '../helpers/semanticRegressionIncremental.js';
import { longitudinalSnapshot } from '../helpers/semanticLongitudinal.js';
import { installEventDiagnosticReport } from '../helpers/semanticEventDiagnosticReport.js';

const reportDirectory = new URL('../.semantic-regression/', import.meta.url);
installEventDiagnosticReport('batches');
afterAll(() => { vi.useRealTimers(); });

// One test owns both loads: no file-sequencer state, rebuild, auxiliary user or third wave.
describe('two-batch semantic simulation', () => {
  it('runs Event → Island twice and scores exactly 2,000 articles', async () => {
    const started = performance.now();
    await mkdir(reportDirectory, { recursive: true });
    await Promise.all(['batch-results.json', 'batch-report.md'].map(name => rm(new URL(name, reportDirectory), { force: true })));
    const batches = await Promise.all([loadSemanticBatch(1), loadSemanticBatch(2)]);
    const source = batches.flatMap(b => b.articles);
    expect(batches.map(b => b.articles.length)).toEqual([1000, 1000]);
    expect(new Set(source.map(a => a.sourceId)).size).toBe(2000);
    expect(new Set(source.map(a => a.url)).size).toBe(2000);
    const times = source.map(a => Date.parse(a.publishedAt));
    expect(Math.max(...times) - Math.min(...times)).toBeLessThan(7 * 86400000);
    expect(Math.max(...batches[0].articles.map(a => Date.parse(a.publishedAt))))
      .toBeLessThan(Math.min(...batches[1].articles.map(a => Date.parse(a.publishedAt))));
    for (const b of batches) {
      expect(b.articles.some(a => a.favoriteInd)).toBe(true);
      expect(b.articles.some(a => a.clickedAmount)).toBe(true);
      expect(b.articles.some(a => a.negativeInd)).toBe(true);
    }
    const taxonomy = JSON.parse(await readFile(await resolveSemanticVectorFixturePath('island-taxonomy'), 'utf8'));
    await db.IslandTaxonomy.bulkCreate(taxonomy.taxonomy.map(r => ({ identity: r.identity, categoryName: r.categoryName,
      displayName: r.displayName, description: r.description ?? null, status: r.status || 'active', vector: r.vector,
      embedding_model: r.embeddingModel || taxonomy.embeddingModel })), { updateOnDuplicate: ['vector', 'embedding_model'] });
    const user = await db.User.create({ username: 'semantic-regression-user' });
    const report = { fixtureDigest: createHash('sha256').update(JSON.stringify(batches)).digest('hex'), phases: [], heldOut: [], publicationStart: new Date(Math.min(...times)), publicationEnd: new Date(Math.max(...times)) };
    let previous = null;
    for (const [index, fixture] of batches.entries()) {
      const phaseStart = performance.now();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Math.max(...fixture.articles.map(a => Date.parse(a.publishedAt))) + 60000);
      const createdAtFrom = new Date(Date.now() - 1);
      const frozen = JSON.parse(await readFile(await resolveSemanticVectorFixturePath(`semantic-regression-batch00${index + 1}`), 'utf8'));
      expect(frozen.articles).toHaveLength(1000);
      expect(frozen.embeddingModel).toBe(taxonomy.embeddingModel);
      for (const row of frozen.articles) {
        expect(row.articleVector.length).toBe(frozen.embeddingDimensions);
        expect(row.articleVector.every(Number.isFinite)).toBe(true);
      }
      expect(await insertMissingFixtureArticles(user.id, fixture, buildVectorMap(frozen),
        'https://fixtures.rssmonster.test/batch', { preservePublishedAt: true })).toBe(1000);
      const eventResult = await runIncrementalEventsForUser(user.id, { createdAtFrom });
      expect(eventResult.articleCount).toBe(1000);
      // Probe incoming held-out articles against the previous batch's behavioral memory.
      // Feedback is applied only afterwards, before the second Island calibration.
      const heldFixtures = fixture.articles.filter(a => a.regression.heldOut || a.regression.role === 'held-out');
      if (heldFixtures.length) {
        await scoreArticlesFromIslandsForUser(user.id);
        const held = await articleRecords.findAll({ where: { userId: user.id, url: heldFixtures.map(a => a.url) } });
        const { results } = await explainArticleInterests(user.id, held);
        for (const article of held) {
          const original = heldFixtures.find(a => a.url === article.url);
          expect(Number(article.favoriteInd) + Number(article.negativeInd) + Number(article.clickedAmount)).toBe(0);
          const diagnostics = results.get(String(article.id));
          expect(diagnostics.seedSelf).toBe(false);
          report.heldOut.push({ sourceId: original.sourceId, title: article.title, scenario: original.regression.scenario,
            expected: original.regression.expectedInterest, wave: original.regression.originalWave || 2,
            interestScore: Number(article.interestScore), recommended: computeRecommended(article), diagnostics });
          if (original.regression.feedbackAfterScoring) await article.update(original.regression.feedbackAfterScoring);
        }
      }
      const calibration = await runIslandCalibrationForUser(user.id);
      const snapshot = await longitudinalSnapshot(user.id, `BATCH00${index + 1}`, );
      const sourceByUrl = new Map(source.map(a => [a.url, a]));
      for (const row of snapshot.rows) {
        const original = sourceByUrl.get(row.url);
        row.sourceId = original.sourceId;
        row.scenario = original.regression.scenario;
        row.batch = original.regression.batch;
      }
      expect(snapshot.rows).toHaveLength((index + 1) * 1000);
      expect(snapshot.metrics['Articles eligible for Recommended']).toBe((index + 1) * 1000);
      expect(snapshot.metrics['Articles with Recommended score']).toBe((index + 1) * 1000);
      expect(snapshot.rows.every(a => Number.isFinite(a.recommended))).toBe(true);
      expect(snapshot.metrics['Recommended coverage (%)']).toBe(100);
      expect(snapshot.islands.activeIslands).toBeGreaterThan(0);
      expect(snapshot.islands.activeIslands).toBeLessThanOrEqual(DEFAULT_MAX_ISLANDS_PER_USER);
      expect(snapshot.rows.some(a => a.interestScore > 0)).toBe(true);
      expect(snapshot.rows.some(a => !a.eventId && a.interestScore === 0)).toBe(true);
      for (const row of snapshot.rows) {
        if (row.interestScore < 0) expect(row.recommended).toBeLessThanOrEqual(row.neutralRecommended);
        if (row.interestScore > 0) expect(row.recommended).toBeGreaterThanOrEqual(row.neutralRecommended);
        if (!row.eventId) expect(row.corroboration).toBe(0);
      }
      expect(snapshot.rows.every(a => a.interestDiagnostics?.paths.length || a.interestScore === 0)).toBe(true);
      const oldEvents = new Set(previous?.events.map(e => e.id) || []);
      const urls = new Set(fixture.articles.map(a => a.url));
      const arrivals = snapshot.rows.filter(a => urls.has(a.url));
      const eventIds = new Set(arrivals.map(a => a.eventId).filter(Boolean));
      const phase = { ...snapshot, milliseconds: performance.now() - phaseStart,
        newEvents: snapshot.events.filter(e => !oldEvents.has(e.id)).length,
        reusedEvents: [...eventIds].filter(id => oldEvents.has(id)).length,
        articlesJoiningExistingEvents: arrivals.filter(a => oldEvents.has(a.eventId)).length,
        islandPersistence: calibration.persistenceSummary };
      if (previous) {
        const oldIslands = new Map(previous.islands.islands.map(i => [i.islandId, i]));
        phase.expandedIslands = snapshot.islands.islands.filter(i =>
          oldIslands.has(i.islandId) && i.memberCount > oldIslands.get(i.islandId).memberCount).length;
        expect(phase.expandedIslands, 'new explicit feedback expands existing behavioral support').toBeGreaterThan(0);
        const current = new Map(snapshot.rows.map(a => [a.id, a]));
        expect(previous.rows.filter(a => a.eventId).every(a => current.get(a.id).eventId === a.eventId)).toBe(true);
        expect(phase.reusedEvents).toBeGreaterThan(0);
      }
      report.phases.push(phase);
      previous = snapshot;
    }
    expect(await articleRecords.count({ where: { userId: user.id } })).toBe(2000);
    report.totalMilliseconds = performance.now() - started;
    await mkdir(reportDirectory, { recursive: true });
    await writeFile(new URL('batch-results.json', reportDirectory), JSON.stringify(report, null, 2));
    const keys = ['articles', 'Events', 'Eventless', 'Islands', 'Singleton Islands', 'Unassigned behavioral profiles',
      'Articles with Recommended score', 'Recommended coverage (%)', 'Positive-interest articles', 'Articles with negative interest',
      'Articles with neutral interest', 'Direct Island matches', 'Behavioral fallback matches'];
    const lines = ['# Two-batch semantic simulation', '', '| Metric | Batch001 | Final after Batch002 |', '| --- | ---: | ---: |',
      ...keys.map(k => `| ${k} | ${report.phases[0].metrics[k]} | ${report.phases[1].metrics[k]} |`), '',
      `Held-out articles scored before feedback: ${report.heldOut.length}.`,
      `Runtime: ${report.phases.map(p => (p.milliseconds / 1000).toFixed(2)).join('s + ')}s; total ${(report.totalMilliseconds / 1000).toFixed(2)}s.`, '',
      'IDs, memberships, Island persistence outcomes and signed interest paths are diagnostic data in batch-results.json.',
      'This seven-day shared-state simulation does not replace isolated occurrence, duplicate or confidence gold tests.'];
    await writeFile(new URL('batch-report.md', reportDirectory), lines.join('\n') + '\n');
    console.log('[BATCH SIMULATION]', JSON.stringify(report.phases.map(p => ({ ...p.metrics, newEvents: p.newEvents,
      reusedEvents: p.reusedEvents, articlesJoiningExistingEvents: p.articlesJoiningExistingEvents,
      expandedIslands: p.expandedIslands || 0, islandPersistence: p.islandPersistence, milliseconds: p.milliseconds }))));
  }, 600000);
});
