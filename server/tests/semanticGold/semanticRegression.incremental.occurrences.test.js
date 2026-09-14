import { installEventDiagnosticReport } from '../helpers/semanticEventDiagnosticReport.js';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import db from '../../models/index.js';
import { buildArticleEventEmbeddingText } from '../../services/articles/embedArticle.js';
import { extractOccurrenceFeatures } from '../../services/events/occurrenceFeatures.js';
import { EVENT_MAX_GAP_HOURS } from '../../services/config/semanticConfig.js';
import { runIncrementalEventsForUser } from '../../services/reconcile/semanticPipelineScopes.js';
import {
  articleContent, buildVectorMap, hashContent, insertMissingFixtureArticles,
  loadFixture, loadIncrementalFixture, selectOccurrenceFixture
} from '../helpers/semanticRegressionIncremental.js';
import {
  expectDifferentEvents, expectEventCounts, expectEventless, expectSameEvent
} from '../helpers/semanticOccurrenceAssertions.js';

const { Article, Event, User } = db;
const fixtureDirectory = new URL('../fixtures/', import.meta.url);
const reportDirectory = new URL('../.semantic-regression/', import.meta.url);
const reportRows = [];
let baseline;
let incremental;
let vectors;
let embeddingModel;

// Each case owns a user so these Qwen vectors cannot mix with the legacy OpenAI corpus.
// Waves preserve real timestamps: scaling a month into six days hides temporal bugs.
async function processScenario(scenario) {
  const baselineArticles = baseline.articles.filter(article => article.regression.scenario === scenario);
  const articles = [...baselineArticles, ...incremental.articles.filter(article => article.regression.scenario === scenario)];
  expect(articles.length).toBeGreaterThan(0);
  const user = await User.create({ username: `semantic-occurrence-${scenario}` });
  const waves = [...new Set(articles.map(article => article.regression.wave))].sort((a, b) => a - b);
  const snapshots = new Map();
  const results = new Map();
  vi.useFakeTimers({ toFake: ['Date'] });
  for (const wave of waves) {
    const waveArticles = articles.filter(article => article.regression.wave === wave);
    const now = Math.max(...waveArticles.map(article => Date.parse(article.publishedAt))) + 60000;
    vi.setSystemTime(now);
    const inserted = await insertMissingFixtureArticles(user.id, {
      categories: incremental.categories,
      feeds: incremental.feeds,
      articles: waveArticles
    }, vectors, 'https://occurrences.example.test', { preservePublishedAt: true });
    expect(inserted).toBe(waveArticles.length);
    results.set(wave, await runIncrementalEventsForUser(user.id, {
      createdAtFrom: new Date(now - 1000)
    }));
    const stored = await Article.findAll({ where: { userId: user.id }, raw: true });
    snapshots.set(wave, stored.map(row => ({
      ...row,
      sourceId: articles.find(article => article.url === row.url)?.sourceId
    })));
  }
  const rows = snapshots.get(waves.at(-1));
  const events = await Event.findAll({ where: { userId: user.id }, raw: true });
  expect(rows).toHaveLength(articles.length);
  expectEventCounts(rows, events);
  return { rows, events, snapshots, results, diagnostics: eventDiagnostics().filter(row => row.userId === user.id) };
}

function report(scenario, expected, result) {
  const memberships = result.rows.map(row => `${row.sourceId}: ${row.eventId ?? 'eventless'}`).join('; ');
  const baselineIds = result.snapshots.get(0)?.map(row => row.eventId);
  const baselineSummary = baselineIds ? `; baseline Events: ${[...new Set(baselineIds)].join(', ')}` : '';
  const actual = `${result.events.length} Events; ${result.rows.filter(row => row.eventId == null).length} eventless${baselineSummary}`;
  reportRows.push({ scenario, expected, actual, memberships });
}

function group(rows, prefix) {
  return rows.filter(row => row.sourceId.startsWith(prefix)).map(row => row.sourceId);
}

describe('semantic regression incremental occurrence identity', () => {
  beforeAll(async () => {
    baseline = selectOccurrenceFixture(await loadFixture(new URL('semantic-regression.json', fixtureDirectory)));
    incremental = await loadIncrementalFixture({ occurrences: true });
    const frozen = await loadFixture(new URL('semantic-regression-occurrences.vectors.json', fixtureDirectory));
    embeddingModel = frozen.embeddingModel;
    vectors = buildVectorMap(frozen);
    const articles = [...baseline.articles, ...incremental.articles];
    expect(baseline.articles).toHaveLength(2);
    expect(incremental.articles).toHaveLength(67);
    expect(new Set(articles.map(article => article.sourceId)).size).toBe(articles.length);
    expect(new Set(articles.map(article => article.url)).size).toBe(articles.length);
    expect(frozen.articles).toHaveLength(articles.length);
    for (const article of articles) {
      const record = frozen.articles.find(row => row.contentSourceHash === hashContent(articleContent(article)));
      expect(record, `Missing real vector for ${article.sourceId}`).toBeTruthy();
      expect(record.embeddingModel).toBe(frozen.embeddingModel);
      expect(record.articleVector).toHaveLength(frozen.dimensions);
      expect(record.articleVector.every(Number.isFinite)).toBe(true);
      expect(record.embeddingInputHash, `Stale vector for ${article.sourceId}; regenerate occurrence vectors`).toBe(hashContent(buildArticleEventEmbeddingText({
        title: article.title, description: article.description, contentText: article.contentOriginal
      })));
    }
  });

  afterEach(() => vi.useRealTimers());

  afterAll(async () => {
    console.table(reportRows);
    await mkdir(reportDirectory, { recursive: true });
    const lines = [
      '# Incremental Event identity regression',
      '[Candidate evidence and assignment outcomes](occurrences-decisions.md)',
      '',
      `Frozen model: ${embeddingModel}. Event IDs below are diagnostic, never hardcoded expectations.`,
      '',
      '| Scenario | Expected | Actual | Memberships |',
      '| --- | --- | --- | --- |',
      ...reportRows.map(row => `| ${row.scenario} | ${row.expected} | ${row.actual} | ${row.memberships} |`)
    ];
    await writeFile(new URL('occurrences.md', reportDirectory), `${lines.join('\n')}\n`);
  });

  it('joins varied launch reporting and later follow-ups to the captured baseline Event', async () => {
    const result = await processScenario('orion');
    report('Orion launch and baseline follow-up', 'one Event; preserve baseline Event through every wave', result);
    const baselineRows = result.snapshots.get(0);
    const baselineId = expectSameEvent(baselineRows, ['orion-launch-a', 'orion-launch-b']);
    for (const rows of result.snapshots.values()) {
      expectSameEvent(rows, rows.map(row => row.sourceId));
      for (const row of rows) expect.soft(row.eventId, `${row.sourceId} must reuse baseline Event`).toBe(baselineId);
    }
    expect.soft(result.events).toHaveLength(1);
    expect.soft(Number(result.events[0]?.articleCount)).toBe(6);
    expect.soft(Number(result.events[0]?.sourceCount)).toBe(4);
    expect.soft(result.results.get(3).linkedToExistingEventCount).toBe(1);
  }, 60000);

  it.each([
    ['versions', 'Orion OS 4.2 versus 4.3', 'os-42-', 'os-43-'],
    ['monthly', 'August versus September security update', 'security-august-', 'security-september-'],
    ['actions', 'Project Nova launch versus cancellation', 'nova-launch-', 'nova-cancel-'],
    ['locations', 'Rotterdam versus Antwerp collisions', 'collision-rotterdam-', 'collision-antwerp-'],
    ['overlap', 'Lyra price cut versus new model launch', 'lyra-price-', 'lyra-launch-']
  ])('%s: separates corroborated occurrences', async (scenario, label, left, right) => {
    const result = await processScenario(scenario);
    report(label, 'two Events; each source group internally together', result);
    expectDifferentEvents(result.rows, group(result.rows, left), group(result.rows, right));
    expect.soft(result.events).toHaveLength(2);
  }, 60000);

  it.each([
    ['minimal-version', '4.2', '4.3', ['version_conflict']],
    ['minimal-location', 'Rotterdam', 'Antwerp', ['location_conflict']],
    ['minimal-state', 'cuts the price of its existing Lyra Air notebook',
      'launches a new generation of Lyra Air notebook', ['action_conflict', 'object_conflict']]
  ])('%s: separates minimal pairs specifically on occurrence evidence', async (scenario, leftFeature, rightFeature, reasons) => {
    const fixture = incremental.articles.filter(article => article.regression.scenario === scenario);
    const left = fixture.filter(article => article.regression.group === '1');
    const right = fixture.filter(article => article.regression.group === '2');
    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);
    // Each publisher's text differs only in the defining feature; no lexical test markers.
    for (let index = 0; index < left.length; index++) {
      expect(left[index].feedId).toBe(right[index].feedId);
      for (const field of ['title', 'description', 'contentOriginal', 'contentHtml']) {
        expect(left[index][field].replaceAll(leftFeature, rightFeature)).toBe(right[index][field]);
      }
    }
    const times = fixture.map(article => Date.parse(article.publishedAt));
    expect(Math.max(...times) - Math.min(...times)).toBe(3 * 60000);
    const result = await processScenario(scenario);
    const leftIds = left.map(article => article.sourceId);
    const rightIds = right.map(article => article.sourceId);
    expectDifferentEvents(result.rows, leftIds, rightIds);
    expect(result.events).toHaveLength(2);
    const existingId = expectSameEvent(result.snapshots.get(1), leftIds);
    expect(expectSameEvent(result.rows, leftIds)).toBe(existingId);
    for (const sourceId of rightIds) {
      const incoming = result.rows.find(row => row.sourceId === sourceId);
      const candidate = result.diagnostics
        .filter(row => row.articleId === incoming.id && row.stage === 'event_candidates')
        .flatMap(row => row.topMatches).find(row => row.eventId === existingId);
      expect(candidate, `${sourceId}: missing comparison with the first occurrence`).toBeTruthy();
      expect(candidate.decision).toBe('reject');
      expect(candidate.temporalCompatibility).toBe(true);
      expect(candidate.eventSpanCompatibility).toBe(true);
      expect(candidate.reasons).toContain('semantic_match');
      expect(candidate.reasons.filter(reason => reason.endsWith('_conflict')).sort()).toEqual([...reasons].sort());
      expect(candidate.reasons).not.toContain('insufficient_semantic_match');
      expect(candidate.reasons).not.toContain('insufficient_support');
    }
    report(scenario, `two Events; reject only on ${reasons.join(', ')}`, result);
  }, 60000);

  it.each([
    'evolution-injuries', 'evolution-pricing', 'evolution-launch',
    'evolution-correction', 'evolution-missing-location', 'evolution-missing-version'
  ])('%s: preserves the existing Event through legitimate follow-ups', async scenario => {
    const fixture = incremental.articles.filter(article => article.regression.scenario === scenario);
    const seeds = fixture.filter(article => article.regression.wave === 1);
    const followUps = fixture.filter(article => article.regression.wave > 1);
    expect(seeds).toHaveLength(2);
    expect(followUps.length).toBeGreaterThan(0);
    if (scenario === 'evolution-injuries') {
      for (const article of fixture) expect(extractOccurrenceFeatures(article).versions).toEqual([]);
    }
    for (const [name, feature] of [['location', 'locations'], ['version', 'versions']]) {
      if (scenario !== `evolution-missing-${name}`) continue;
      for (const seed of seeds) expect(extractOccurrenceFeatures(seed)[feature].length).toBeGreaterThan(0);
      for (const followUp of followUps) expect(extractOccurrenceFeatures(followUp)[feature]).toEqual([]);
    }
    if (['evolution-pricing', 'evolution-launch'].includes(scenario)) {
      expect(extractOccurrenceFeatures(followUps.at(-1)).actions)
        .not.toEqual(extractOccurrenceFeatures(seeds[0]).actions);
    }
    const result = await processScenario(scenario);
    report(scenario, 'one Event; every later wave reuses it without occurrence conflicts', result);
    const existingId = expectSameEvent(result.snapshots.get(1), seeds.map(article => article.sourceId));
    expect(result.events).toHaveLength(1);
    for (const rows of result.snapshots.values()) {
      expect(expectSameEvent(rows, rows.map(row => row.sourceId))).toBe(existingId);
    }
    for (const followUp of followUps) {
      const article = result.rows.find(row => row.sourceId === followUp.sourceId);
      const checks = result.diagnostics.filter(row => row.articleId === article.id);
      const candidate = checks.filter(row => row.stage === 'event_candidates')
        .flatMap(row => row.topMatches).find(row => row.eventId === existingId);
      expect(candidate, `${followUp.sourceId}: missing existing Event evaluation`).toBeTruthy();
      expect(candidate.decision).toBe('join');
      expect(candidate.reasons.filter(reason => reason.endsWith('_conflict'))).toEqual([]);
      expect(candidate).toMatchObject({ versionConflict: false, locationConflict: false, actionConflict: false, objectConflict: false });
      expect(checks.find(row => row.stage === 'assignment')).toMatchObject({
        eventId: existingId, decision: 'join', outcome: 'reused'
      });
      expect(result.results.get(followUp.regression.wave).linkedToExistingEventCount).toBe(1);
    }
  }, 60000);

  it('prevents a 28-hour Event from forming through two 14-hour links', async () => {
    const result = await processScenario('chain');
    report('Temporal chaining', 'A and B together; C eventless; no Event exceeds time window', result);
    const [a, b, c] = ['harbour-a', 'harbour-b', 'harbour-c'].map(id => result.rows.find(row => row.sourceId === id));
    const hours = (left, right) => (new Date(right.publishedAt) - new Date(left.publishedAt)) / 3600000;
    expect(hours(a, b)).toBeLessThan(EVENT_MAX_GAP_HOURS);
    expect(hours(b, c)).toBeLessThan(EVENT_MAX_GAP_HOURS);
    expect(hours(a, c)).toBeGreaterThan(EVENT_MAX_GAP_HOURS);
    const existingId = expectSameEvent(result.snapshots.get(2), ['harbour-a', 'harbour-b']);
    expect.soft(expectSameEvent(result.rows, ['harbour-a', 'harbour-b'])).toBe(existingId);
    expectEventless(result.rows, 'harbour-c');
    for (const event of result.events) {
      const times = result.rows.filter(row => row.eventId === event.id).map(row => Date.parse(row.publishedAt));
      expect.soft(Math.max(...times) - Math.min(...times)).toBeLessThan(EVENT_MAX_GAP_HOURS * 3600000);
    }
  }, 60000);

  it('leaves vague Nova coverage Eventless with two pre-existing product Events', async () => {
    const result = await processScenario('ambiguous');
    report('Ambiguous Nova update', 'two existing product Events; vague article eventless', result);
    const before = result.snapshots.get(2);
    expectDifferentEvents(before, ['products-tablet-a', 'products-tablet-b'], ['products-camera-a', 'products-camera-b']);
    expectDifferentEvents(result.rows, ['products-tablet-a', 'products-tablet-b'], ['products-camera-a', 'products-camera-b']);
    for (const row of before) {
      expect.soft(result.rows.find(article => article.id === row.id).eventId).toBe(row.eventId);
    }
    expectEventless(result.rows, 'products-vague');
    expect.soft(result.events).toHaveLength(2);
    expect.soft(result.results.get(3).createdEventIds).toHaveLength(0);
  }, 60000);

  // The frozen real embeddings have cosine 0.9065 and pass the same occurrence policy.
  it('joins English and Dutch coverage of the same research-center opening', async () => {
    const result = await processScenario('multilingual');
    report('Amsterdam opening across languages', 'same Event', result);
    expectSameEvent(result.rows, ['research-en', 'research-nl']);
    expect.soft(result.events).toHaveLength(1);
    expect.soft(Number(result.events[0]?.articleCount)).toBe(2);
    expect.soft(Number(result.events[0]?.sourceCount)).toBe(2);
  }, 60000);
});

const eventDiagnostics = installEventDiagnosticReport('occurrences');
