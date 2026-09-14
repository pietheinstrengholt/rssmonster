import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { readSemanticFixtureFile as readFile } from '../helpers/semanticBatchFixtures.js';
import db from '../../models/index.js';
import { cosineSimilarity } from '../../services/vectors/index.js';
import { EVENT_MAX_GAP_HOURS, EVENT_SIM_THRESHOLD } from '../../services/config/semanticConfig.js';
import { extractOccurrenceFeatures } from '../../services/events/occurrenceFeatures.js';
import { topicDiagnosticChannel } from '../../services/topics/event/topicDecisionDiagnostics.js';
import { evaluateTopicCandidates } from '../../services/topics/event/topicDecisionPolicy.js';
import { buildInterestIslandProfilesForUser } from '../../services/islands/islandArticleProfiles.js';
import { persistIslandProfilesForUser } from '../../services/islands/runIslandCalibration.js';
import { evaluateArticleInterest, prepareIslandEvidence, islandCohesion, deriveIslandConfidence } from '../../services/islands/islandInterestConfidence.js';
import { computeRecommended } from '../../services/recommendations/recommendedScore.js';
import { installEventDiagnosticReport } from '../helpers/semanticEventDiagnosticReport.js';
import { expansionFixture, scenarioArticles, loadExpansionVectors, processExpansionScenario,
  writeExpansionReport, expansionDirectory, requiredBehavioralTransfers } from '../helpers/semanticExpansion.js';

const eventDiagnostics = installEventDiagnosticReport('expansion');
const results = [];
const checks = [];
const controlled = [];
const naturalTransfers = [];
const topicDiagnostics = [];
const topicListener = row => topicDiagnostics.push(row);
let vectors;
const check = (scenario, label, pass, classification, details = '') => {
  checks.push({ scenario: scenario.id, label, pass: Boolean(pass), classification, details });
  expect.soft(Boolean(pass), `${scenario.id}: ${label}; ${details}`).toBe(true);
};
const sameEvent = rows => rows.length > 0 && rows.every(r => r.eventId != null && r.eventId === rows[0].eventId);
const topicsFor = (result, group) => {
  const eventIds = new Set(result.rows.filter(r => r.regression.eventGroup === group).map(r => r.eventId));
  return new Set(result.links.filter(l => eventIds.has(l.eventId)).map(l => l.topicId));
};
const diagnosticSummary = result => JSON.stringify(result.rows.map(r => ({ source: r.sourceId, event: r.eventId, topic: r.topicId })));
const matchingReasons = result => eventDiagnostics().filter(d => d.userId === result.userId)
  .flatMap(d => [...(d.topMatches || []), ...(d.candidates || [])]).flatMap(c => c.reasons || []);

beforeAll(async () => {
  ({ vectors } = await loadExpansionVectors());
  topicDiagnosticChannel.subscribe(topicListener);
});
afterEach(() => vi.useRealTimers());
afterAll(async () => {
  topicDiagnosticChannel.unsubscribe(topicListener);
  await writeExpansionReport(results, checks, controlled, naturalTransfers);
  await writeFile(new URL('expansion-topic-decisions.json', expansionDirectory), JSON.stringify(topicDiagnostics, null, 2));
});

function validateCommon(scenario, result) {
  const canonical = result.rows.filter(a => a.status !== 'duplicate' && !a.duplicateOfArticleId);
  check(scenario, 'all fixture Articles are exercised', result.rows.length === scenarioArticles(scenario).length, 'fixture issue');
  check(scenario, '100% finite Recommended coverage', canonical.every(a => Number.isFinite(a.recommended)), 'recommendation-scoring defect');
  check(scenario, 'unmatched interest is exactly neutral', canonical.every(a => a.interestDiagnostics.paths.length || a.interestScore === 0), 'recommendation-scoring defect');
  for (const event of result.events) {
    const members = canonical.filter(a => a.eventId === event.id);
    const span = (Math.max(...members.map(a => +new Date(a.publishedAt))) - Math.min(...members.map(a => +new Date(a.publishedAt)))) / 3600000;
    check(scenario, `Event ${event.id} canonical counts and minimum support`, members.length >= 2 && members.length === Number(event.articleCount)
      && new Set(members.map(a => a.feedId)).size === Number(event.sourceCount), 'Event defect');
    check(scenario, `Event ${event.id} whole span below configured window`, span < EVENT_MAX_GAP_HOURS, 'Event defect', `span=${span}`);
  }
}

function validateEvents(scenario, result) {
  const details = diagnosticSummary(result);
  const groups = [...new Set(result.rows.map(r => r.regression.eventGroup))];
  if (scenario.eventlessLast) {
    check(scenario, 'first two reports form one Event', sameEvent(result.rows.slice(0, 2)), 'Event defect', details);
    check(scenario, 'outside-span Article remains Eventless', result.rows.at(-1).eventId == null, 'Event defect', details);
  } else {
    for (const group of groups) {
      const members = result.rows.filter(r => r.regression.eventGroup === group);
      const sim = members.length === 2 ? cosineSimilarity(members[0].articleVector, members[1].articleVector) : null;
      check(scenario, `same occurrence ${group} shares an Event`, sameEvent(members), sim != null && sim < EVENT_SIM_THRESHOLD ? 'embedding instability' : 'Event defect', `${details}; pairSimilarity=${sim}`);
    }
    if (groups.length > 1) check(scenario, 'different occurrence groups have distinct Events', new Set(result.rows.map(r => r.eventId)).size === groups.length, 'Event defect', details);
  }
  if (scenario.reason?.endsWith('_conflict')) check(scenario, `diagnostic ${scenario.reason}`, matchingReasons(result).includes(scenario.reason), 'Event defect', matchingReasons(result).join(', '));
  if (scenario.category === 'numeric-evolution') {
    check(scenario, 'unscoped numerical updates are not parsed as versions', result.source.every(a => extractOccurrenceFeatures(a).versions.length === 0), 'Event defect');
  }
}

function validateTopics(scenario, result) {
  const groups = [...new Set(result.rows.map(r => r.regression.eventGroup))];
  const memberships = groups.map(g => topicsFor(result, g));
  const shared = [...memberships[0]].filter(id => memberships.every(set => set.has(id)));
  check(scenario, 'each occurrence has Topic membership', memberships.every(set => set.size > 0), scenario.kind === 'multilingual' && result.rows.some(r => !r.eventId) ? 'embedding instability' : 'Topic defect', diagnosticSummary(result));
  check(scenario, scenario.sameTopic ? 'durable subject reuses one Topic' : 'unrelated subjects do not share Topics',
    scenario.sameTopic ? shared.length > 0 : memberships.every((set, i) => memberships.slice(i + 1).every(other => [...set].every(id => !other.has(id)))), 'Topic defect', JSON.stringify(memberships.map(set => [...set])));
}

function controlledTopicAmbiguity(scenario, result) {
  const titles = [...new Set(result.source.map(a => a.regression.eventGroup))].map(g => result.source.find(a => a.regression.eventGroup === g).title);
  const candidates = titles.slice(0, 2).map((name, i) => ({ topic: { id: i + 1, name }, sim: 0.9 }));
  const subjects = new Map(titles.slice(0, 2).map((title, i) => [i + 1, { title, anchorEventId: i + 1, memberEventCount: 1 }]));
  const decision = evaluateTopicCandidates({ semanticUnit: { id: 3, title: titles[2] }, candidates, subjects,
    primaryThreshold: 0.76, secondaryThreshold: 0.62 });
  check(scenario, 'equal-confidence subject candidates remain ambiguous', decision.ambiguous && decision.selected.length === 0, 'Topic defect');
}

// Use explicit geometry to isolate support and intent, never present these vectors as Qwen output.
const axis = (index, dimensions = 14) => Array.from({ length: dimensions }, (_, i) => Number(i === index));
const nearby = (index, similarity = 0.95) => axis(index).map((v, i) => i === 13 ? Math.sqrt(1 - similarity ** 2) : v * similarity);
function evaluateControlledBehavior(scenario, result) {
  const training = result.rows.filter(a => a.regression.role === 'training');
  const held = result.rows.filter(a => a.regression.role === 'held-out');
  const now = Math.max(...result.source.map(a => Date.parse(a.publishedAt))) + 60000;
  const seeds = training.map((a, i) => ({ ...a, articleVector: axis(scenario.mode === 'capacity' ? i : 0) }));
  const knownIsland = { id: 1, islandVector: axis(0), weight: 0.8 };
  const supported = { ...prepareIslandEvidence([knownIsland], seeds.filter((_, i) => scenario.mode !== 'capacity' || i === 0)), now };
  for (const [index, article] of held.entries()) {
    const group = article.regression.interestGroup ?? 0;
    const source = seeds.find(a => a.regression.interestGroup === group) || seeds[0];
    const unrelated = article.regression.intentRelation === 'unrelated';
    const incoming = { ...article, articleVector: unrelated ? axis(12) : nearby(group) };
    let context = supported;
    let articleTopics = [];
    let islandTopics = [];
    if (scenario.mode === 'capacity') {
      // A full, unrelated memory cannot represent this explicit source. No forced Island membership.
      context = { ...prepareIslandEvidence([{ id: 1, islandVector: axis(11), weight: 0.8 }], [], [source]), now };
    } else if (index === 2) {
      incoming.articleVector = axis(12);
      articleTopics = [{ topicId: 1, confidence: 0.9 }];
      islandTopics = [{ islandId: 1, topicId: 1, confidence: 0.9, similarity: 0.9 }];
    } else if (index === 3) incoming.articleVector = nearby(0, 0.63);
    const evaluation = evaluateArticleInterest(incoming, context, articleTopics, islandTopics);
    const expected = article.regression.expectedInterest || 'positive';
    const sign = source.negativeInd ? -1 : 1;
    const pass = expected === 'neutral' ? evaluation.score === 0 : expected === 'attenuated'
      ? Math.sign(evaluation.score) === sign && Math.abs(evaluation.score) < 0.02
      : expected === 'negative' ? evaluation.score < -0.1 : evaluation.score > 0;
    check(scenario, `${article.sourceId} controlled held-out ${expected}`, pass, 'recommendation-scoring defect', JSON.stringify(evaluation));
    check(scenario, `${article.sourceId} is held-out, never seed/self`, !evaluation.seedSelf && evaluation.paths.every(p => !p.seedSelf), 'fixture issue');
    check(scenario, `${article.sourceId} replay does not strengthen preference`, evaluation.score === evaluateArticleInterest(incoming, context, articleTopics, islandTopics).score, 'recommendation-scoring defect');
    if (scenario.mode === 'capacity' && expected !== 'neutral') check(scenario, `${article.sourceId} explicit fallback path`, evaluation.paths.some(p => p.matchType === 'behavioral-fallback'), 'recommendation-scoring defect');
    if (index === 2 && scenario.mode !== 'capacity') check(scenario, `${article.sourceId} uses complete Topic path`, evaluation.paths[0]?.matchType === 'topic-island', 'recommendation-scoring defect');
    controlled.push({ scenario: scenario.id, sourceId: article.sourceId, title: article.title, expected, score: evaluation.score, paths: evaluation.paths });
  }
  if (scenario.mode !== 'capacity') {
    const seedResult = evaluateArticleInterest(seeds[0], supported);
    check(scenario, 'training self-match is identified diagnostically', seedResult.seedSelf && seedResult.paths.some(p => p.seedSelf), 'recommendation-scoring defect');
    const one = { ...prepareIslandEvidence([knownIsland], seeds.slice(0, 1)), now };
    const many = { ...prepareIslandEvidence([knownIsland], seeds), now };
    if (seeds.length > 1) {
      check(scenario, 'durable support exceeds singleton at equal similarity', evaluateArticleInterest({ id: -1, articleVector: nearby(0) }, many).score > evaluateArticleInterest({ id: -1, articleVector: nearby(0) }, one).score, 'Island defect');
      const noisy = islandCohesion([{ ...seeds[0] }, { ...seeds[1], articleVector: axis(12) }], axis(0));
      check(scenario, 'noisy support has less authority', deriveIslandConfidence(noisy) < many.islands[0].islandConfidence, 'Island defect');
    } else check(scenario, 'singleton confidence is useful and below full authority', one.islands[0].islandConfidence > 0 && one.islands[0].islandConfidence < 1, 'Island defect');
  }
}

async function validateBehavior(scenario, result) {
  const training = result.rows.filter(a => a.regression.role === 'training');
  const held = result.rows.filter(a => a.regression.role === 'held-out');
  check(scenario, 'held-out Articles absent during formation', result.snapshots[0].articleCount === training.length
    && held.every(a => !result.snapshots[0].memberIds.includes(a.id)), 'fixture issue');
  if (scenario.mode !== 'capacity') {
    check(scenario, 'natural held-out related Articles have positive interest', held.every(a => a.interestScore > 0), 'Island defect', held.map(a => `${a.sourceId}=${a.interestScore}`).join('; '));
    check(scenario, 'coherent natural training evidence forms one Island', result.profiles.length === 1 && result.profiles[0].articles.length === training.length, 'Island defect');
  } else {
    check(scenario, 'cap pressure leaves behavioral profiles unassigned', result.profiles.length <= 3 && result.profiles.summary.unassignedBehavioralProfiles > 0, 'Island defect');
    const mock = vi.spyOn(db.Article, 'findAll').mockResolvedValue(training.map((a, i) => ({ ...a, articleVector: axis(i) })));
    try {
      const defaultCapacity = await buildInterestIslandProfilesForUser(result.userId);
      check(scenario, 'controlled eleven unrelated profiles respect the default cap without forced joins', defaultCapacity.length === 10
        && defaultCapacity.summary.unassignedBehavioralProfiles === 1 && defaultCapacity.every(p => p.articles.length === 1), 'Island defect');
    } finally { mock.mockRestore(); }
    check(scenario, 'explicit negative evidence survives natural cap pressure', result.evidence.fallbackEvidence.some(a => a.negativeInd), 'Island defect');
    const now = Math.max(...result.source.map(a => Date.parse(a.publishedAt))) + 60000;
    for (const { article, source, unassigned } of requiredBehavioralTransfers(result)) {
      check(scenario, `${article.sourceId} required source remains unassigned`, unassigned, 'Island defect');
      if (!unassigned) continue;
      // Probe this unassigned source alone; the actual multi-preference aggregate remains in the report.
      const transfer = evaluateArticleInterest(article, { islands: [], fallbackEvidence: [source], now });
      const expected = article.regression.expectedInterest;
      const magnitude = Math.abs(transfer.score);
      const pass = expected === 'neutral' ? magnitude <= 0.005 : expected === 'attenuated' ? magnitude < 0.02
        : expected === 'negative' ? transfer.score < -0.025 : transfer.score > 0;
      check(scenario, `${article.sourceId} frozen-Qwen unassigned-source ${expected}`, pass, 'recommendation-scoring defect', JSON.stringify(transfer));
      naturalTransfers.push({ scenario: scenario.id, sourceId: article.sourceId, behavioralSource: source.sourceId,
        title: article.title, expected, score: transfer.score, paths: transfer.paths });
    }
  }
  const before = await db.Island.findAll({ where: { userId: result.userId }, order: [['id', 'ASC']], raw: true });
  await persistIslandProfilesForUser(result.userId, result.profiles);
  const after = await db.Island.findAll({ where: { userId: result.userId }, order: [['id', 'ASC']], raw: true });
  check(scenario, 'unchanged calibration does not inflate signal snapshots', JSON.stringify(before.map(i => i.positiveSignals)) === JSON.stringify(after.map(i => i.positiveSignals)), 'Island defect');
  evaluateControlledBehavior(scenario, result);
}

describe('expanded semantic diversity and recommendation gold', () => {
  it.each(expansionFixture.scenarios)('$id: $expected', async scenario => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const result = await processExpansionScenario(scenario, vectors, time => vi.setSystemTime(time));
    results.push({ ...result, scenario });
    validateCommon(scenario, result);
    if (['topic', 'ambiguity'].includes(scenario.kind)) {
      let arrived = 0;
      for (const snapshot of result.snapshots) {
        const incoming = result.source.filter(a => a.regression.eventGroup === snapshot.phase);
        arrived += incoming.length;
        check(scenario, `Topic wave ${snapshot.phase} excludes future Articles`, snapshot.articleCount === arrived, 'fixture issue');
        const members = result.rows.filter(a => a.regression.eventGroup === snapshot.phase);
        check(scenario, `Topic wave ${snapshot.phase} uses its publication clock`, members.every(a => +new Date(a.createdAt) === snapshot.time)
          && result.links.filter(l => members.some(a => a.eventId === l.eventId)).every(l => +new Date(l.createdAt) === snapshot.time), 'fixture issue');
      }
    }
    if (['event', 'multilingual'].includes(scenario.kind)) validateEvents(scenario, result);
    if (['topic', 'multilingual'].includes(scenario.kind)) validateTopics(scenario, result);
    if (scenario.kind === 'ambiguity') {
      const incoming = result.events.at(-1);
      const diagnostics = topicDiagnostics.filter(d => d.eventId === incoming.id).at(-1);
      check(scenario, 'natural bridge has no forced primary', !result.links.some(l => l.eventId === incoming.id && l.primaryInd),
        diagnostics?.winnerMargin >= 0.04 ? 'fixture issue' : 'Topic defect', JSON.stringify(diagnostics));
      controlledTopicAmbiguity(scenario, result);
    }
    if (scenario.kind === 'behavior') await validateBehavior(scenario, result);
    if (scenario.kind === 'duplicate') {
      check(scenario, 'exact syndication points to the canonical record', result.rows[1].duplicateOfArticleId === result.rows[0].id, 'Event defect');
      check(scenario, 'independent reporting remains canonical', result.rows[3].duplicateOfArticleId == null, 'Event defect');
      const candidate = eventDiagnostics().filter(d => d.articleId === result.rows[3].id && d.stage === 'event_candidates')
        .flatMap(d => d.topMatches || []).find(c => c.eventId === result.rows[0].eventId);
      check(scenario, 'independent reporting corroborates the same Event', result.rows[3].eventId != null && result.rows[3].eventId === result.rows[0].eventId,
        candidate?.reasons.includes('insufficient_semantic_match') ? 'embedding instability' : 'Event defect',
        `${diagnosticSummary(result)}; candidate=${JSON.stringify(candidate)}`);
      await db.Article.update({ favoriteInd: 1 }, { where: { userId: result.userId } });
      const profiles = await buildInterestIslandProfilesForUser(result.userId);
      const duplicateIds = new Set(result.rows.filter(r => r.duplicateOfArticleId).map(r => r.id));
      const memberIds = profiles.flatMap(p => p.articles.map(a => a.articleId));
      check(scenario, 'duplicate copies cannot become behavioral support', memberIds.length > 0
        && memberIds.every(id => !duplicateIds.has(id)) && new Set(memberIds).size === memberIds.length, 'Island defect');
    }
  }, 60000);

  it('accounts for all added articles and keeps opposing paths bounded without double counting', async () => {
    const scenario = { id: 'expansion-contract' };
    check(scenario, '226 purposeful new Articles with unique source keys', expansionFixture.articles.length === 226
      && new Set(expansionFixture.articles.map(a => a.sourceId)).size === 226, 'fixture issue');
    check(scenario, 'all expansion Articles stored and evaluated', results.reduce((n, r) => n + r.rows.length, 0) === 226, 'fixture issue');
    check(scenario, '40 explicit held-out outcomes exercised', controlled.length === 40, 'fixture issue');
    check(scenario, '21 required natural behavioral transfer outcomes exercised', naturalTransfers.length === 21, 'fixture issue');
    const content = await readFile(new URL('../fixtures/semantic-regression-expansion.json', import.meta.url), 'utf8');
    check(scenario, 'scenario labels are metadata only', !expansionFixture.articles.some(a => /held.out|fixture|regression/i.test(a.title + a.description)), 'fixture issue');
    check(scenario, 'fixture remains valid JSON', JSON.parse(content).schemaVersion === 1, 'fixture issue');
    const positive = { id: 1, islandVector: [1, 0], weight: 0.8 };
    const negative = { id: 2, islandVector: [1, 0], weight: -0.4 };
    const behavior = [{ id: 1, articleVector: [1, 0], favoriteInd: 1, feedId: 1, publishedAt: new Date() }];
    const prepared = prepareIslandEvidence([positive, negative], behavior);
    const incoming = { id: 99, articleVector: [1, 0] };
    const evaluation = evaluateArticleInterest(incoming, prepared, [{ topicId: 1, confidence: 1 }],
      [{ topicId: 1, islandId: 1, confidence: 1, similarity: 1 }]);
    check(scenario, 'opposite Island signs survive bounded deduplicated aggregation', evaluation.paths.length === 2
      && evaluation.paths.some(p => p.contribution < 0) && evaluation.paths.some(p => p.contribution > 0)
      && Math.abs(evaluation.score) <= 1, 'recommendation-scoring defect');
    const cap = results.find(r => r.scenario.id === 'capacity-and-intent');
    const disliked = cap.rows.find(r => r.negativeInd);
    const target = cap.rows.find(r => r.regression.role === 'held-out');
    const now = +new Date(disliked.publishedAt) + 86400000;
    const positiveContext = { ...prepareIslandEvidence([positive], behavior), now };
    const negativeSource = { ...disliked, articleVector: [1, 0] };
    const mixedContext = { ...positiveContext, fallbackEvidence: [negativeSource] };
    const heldIncoming = { ...target, articleVector: [1, 0] };
    const mixed = evaluateArticleInterest(heldIncoming, mixedContext);
    check(scenario, 'positive Island and explicit negative profile both survive', mixed.paths.length === 2
      && mixed.score < evaluateArticleInterest(heldIncoming, positiveContext).score, 'recommendation-scoring defect');
    check(scenario, 'duplicated explicit preference cannot stack penalties', mixed.score === evaluateArticleInterest(heldIncoming,
      { ...mixedContext, fallbackEvidence: [negativeSource, negativeSource] }).score, 'recommendation-scoring defect');
    check(scenario, 'negative evidence lowers Recommended', computeRecommended({ interestScore: -0.2 }) < computeRecommended({ interestScore: 0 }), 'recommendation-scoring defect');
  });
});
