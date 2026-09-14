import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { computeArticleSignals } from '../../services/islands/islandArticleProfiles.js';
import { runIslandCalibrationForUser } from '../../services/islands/runIslandCalibration.js';
import { summarizeIslandLifecycle } from '../../services/islands/islandLifecycle.js';
import { loadIslandEvidence, evaluateArticleInterest } from '../../services/islands/islandInterestConfidence.js';
import { behaviorRecencyWeight, SIGNAL_HALF_LIFE_DAYS, SIGNAL_WEIGHTS, isStaleIsland } from '../../services/islands/islandVectorUtils.js';
import { computeRecommendedBreakdown } from '../../services/recommendations/recommendedScore.js';

const days = [0, 7, 30, 90, 180, 365];
const at = day => new Date(Date.UTC(2026, 8, 14, 12) + day * 86400000);
const signals = {
  click: ['clickedAmount', 'lastClickedAt', SIGNAL_WEIGHTS.click],
  deep: ['attentionBucket', 'lastMeaningfulReadAt', SIGNAL_WEIGHTS.deepRead],
  favorite: ['favoriteInd', 'favoritedAt', SIGNAL_WEIGHTS.star],
  positive: ['positiveInd', 'positiveFeedbackAt', SIGNAL_WEIGHTS.positive],
  negative: ['negativeInd', 'negativeFeedbackAt', SIGNAL_WEIGHTS.negative]
};
const behavior = (names, day = 0) => Object.fromEntries(names.flatMap(name => {
  const [flag, clock] = signals[name];
  return [[flag, name === 'deep' ? 3 : 1], [clock, at(day)]];
}));
const scenarios = [
  { name: 'click', groups: [['click']] },
  { name: 'repeated-deep', groups: [['deep']], count: 3 },
  { name: 'favorite', groups: [['favorite']] },
  { name: 'more-like-this', groups: [['positive']] },
  { name: 'not-interested', groups: [['negative']] },
  { name: 'mixed-click-favorite', groups: [['click', 'favorite']] },
  { name: 'abandoned', groups: [['click']], count: 3 },
  { name: 'reactivated', groups: [['click']], returnDay: 180 },
  { name: 'simultaneous', groups: [['favorite'], ['click']] },
  { name: 'event-burst', groups: [['favorite'], ['click']], event: true },
  { name: 'continued-strong', groups: [['positive']], continued: true }
];
const results = [];
const calibrate = userId => runIslandCalibrationForUser(userId, { generateLabels: false });

async function fixture(spec) {
  const user = await db.User.create({ username: `forgetting-${randomUUID()}` });
  const category = await db.Category.create({ userId: user.id, name: 'Forgetting' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Evaluation', url: `https://${user.id}.example/rss` });
  const base = { userId: user.id, feedId: feed.id, publishedAt: new Date('2022-01-01') };
  const sources = [];
  const candidates = [];
  for (let group = 0; group < 3; group++) {
    const articleVector = [0, 0, 0]; articleVector[group] = 1;
    const title = ['Kubernetes technical deployment', 'Earthquake emergency response', 'Sourdough baking technique'][group];
    // Held-outs share a controlled direction but never contribute behavioral evidence.
    candidates.push(await db.Article.create({ ...base, title: `${title} held-out`, articleVector, status: 'unread' }));
    if (!spec.groups[group]) continue;
    const count = spec.event && group === 1 ? 3 : spec.count || 1;
    for (let n = 0; n < count; n++) {
      sources.push({ group, row: await db.Article.create({ ...base, title, articleVector, status: 'read', ...behavior(spec.groups[group]) }) });
    }
  }
  let event;
  if (spec.event) {
    const burst = sources.filter(source => source.group === 1);
    event = await db.Event.create({ userId: user.id, representativeArticleId: burst[0].row.id, name: 'Breaking earthquake', articleCount: 3, sourceCount: 1, status: 'active', eventWindowStartAt: at(0), eventWindowEndAt: at(0) });
    for (const source of burst) await source.row.update({ eventId: event.id });
  }
  return { user, sources, candidates, event };
}

async function snapshot(fixture, day) {
  for (const source of fixture.sources) await source.row.reload();
  const context = await loadIslandEvidence(fixture.user.id);
  const islands = await db.Island.findAll({ where: { userId: fixture.user.id }, order: [['id', 'ASC']] });
  const evidence = fixture.sources.map(({ group, row }) => {
    const raw = {}; const decayed = {};
    for (const [name, [flag, clock, weight]] of Object.entries(signals)) {
      raw[name] = name === 'click' ? Math.min(row[flag], 3) : name === 'deep' ? Number(row[flag] >= 3) : Number(row[flag] === 1);
      decayed[name] = raw[name] * weight * behaviorRecencyWeight(row[clock] ?? row.publishedAt, SIGNAL_HALF_LIFE_DAYS[clock]);
    }
    const computed = computeArticleSignals(row);
    expect(decayed.click + decayed.deep + decayed.favorite + decayed.positive).toBeCloseTo(computed.positiveScore, 10);
    expect(decayed.negative).toBeCloseTo(computed.negativeScore, 10);
    return { group, raw, decayed, clocks: Object.fromEntries(Object.values(signals).map(([, clock]) => [clock, row[clock]])), publishedAt: row.publishedAt };
  });
  const pool = [];
  for (const [group, candidate] of fixture.candidates.entries()) {
    await candidate.reload();
    const explanation = evaluateArticleInterest(candidate, context);
    expect(Number(candidate.interestScore)).toBe(explanation.score);
    expect(explanation.seedSelf).toBe(false);
    // Fixed non-interest inputs isolate forgetting from article freshness and Event corroboration.
    const ranking = computeRecommendedBreakdown({ interestScore: candidate.interestScore, freshness: 0.5 });
    expect(Number.isFinite(ranking.recommended)).toBe(true);
    pool.push({ group, interestScore: Number(candidate.interestScore), recommended: ranking.recommended, paths: explanation.paths });
  }
  const ordered = [...pool].sort((a, b) => b.recommended - a.recommended || a.group - b.group);
  for (const candidate of pool) candidate.rank = ordered.indexOf(candidate) + 1;
  return { day, evidence, islands: islands.map(island => {
    const group = island.islandVector.indexOf(Math.max(...island.islandVector));
    const support = fixture.sources.filter(source => source.group === group).map(source => source.row);
    const lifecycle = summarizeIslandLifecycle(support, island.islandVector);
    return { id: island.id, group, weight: Number(island.weight), scoringConfidence: context.islands.find(row => row.id === island.id)?.islandConfidence ?? null,
      lifecycleConfidence: lifecycle.confidence, lastBehaviorAt: lifecycle.lastBehaviorAt, stale: isStaleIsland(lifecycle), archived: Boolean(island.archivedInd), archivedAt: island.archivedAt };
  }), pool };
}

describe('controlled Interest Island forgetting evaluation', () => {
  beforeAll(async () => { if (db.sequelize.getDialect() === 'sqlite') await db.sequelize.sync(); });
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(at(0)); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  afterAll(() => {
    const directory = new URL('../.semantic-regression/forgetting/', import.meta.url);
    mkdirSync(directory, { recursive: true });
    writeFileSync(new URL(`${db.sequelize.getDialect()}.json`, directory), JSON.stringify({ days, halfLives: SIGNAL_HALF_LIFE_DAYS, scenarios: results }, null, 2));
  });

  it.each(scenarios)('$name: records evidence, lifecycle and held-out ranking with replay safety', async spec => {
    const data = await fixture(spec);
    const snapshots = [];
    for (const day of days) {
      vi.setSystemTime(at(day));
      if (spec.continued && day > 0) await data.sources[0].row.update(behavior(['positive'], day));
      if (day === spec.returnDay) await data.sources[0].row.update(behavior(['favorite'], day));
      await calibrate(data.user.id);
      const current = await snapshot(data, day);
      await calibrate(data.user.id);
      expect(await snapshot(data, day)).toEqual(current);
      snapshots.push(current);
      expect(current.pool[2].interestScore).toBe(0);
      if (!spec.continued && (!spec.returnDay || day < spec.returnDay)) {
        for (const island of current.islands) {
          if (island.lastBehaviorAt) expect(island.lastBehaviorAt.getTime()).toBe(at(0).getTime());
        }
      }
      if (!spec.continued && day !== spec.returnDay) {
        for (const evidence of current.evidence) {
          for (const [name, [, clock]] of Object.entries(signals)) {
            if (evidence.raw[name] && !(spec.returnDay && name === 'favorite')) expect(evidence.clocks[clock]).toEqual(at(0));
          }
        }
      }
    }
    const first = snapshots[0]; const last = snapshots.at(-1);
    if (spec.returnDay) {
      expect(snapshots[3].islands[0].archived).toBe(true);
      expect(snapshots[4].islands[0].archived).toBe(false);
      expect(snapshots[4].islands[0].id).toBe(first.islands[0].id);
      expect(snapshots[4].pool[0].interestScore).toBeGreaterThan(0);
      expect(snapshots[4].islands[0].lastBehaviorAt).toEqual(at(spec.returnDay));
    } else if (spec.continued) {
      expect(snapshots.every(row => !row.islands[0].archived)).toBe(true);
      expect(last.pool[0].interestScore).toBe(first.pool[0].interestScore);
    } else {
      expect(Math.abs(last.pool[0].interestScore)).toBeLessThan(Math.abs(first.pool[0].interestScore));
      for (const name of spec.groups[0]) expect(last.evidence[0].decayed[name]).toBeLessThan(first.evidence[0].decayed[name]);
    }
    if (['click', 'abandoned', 'repeated-deep'].includes(spec.name)) {
      expect(last.islands[0].archived).toBe(true);
      expect(last.pool[0].interestScore).toBe(0);
    }
    if (['favorite', 'more-like-this', 'not-interested'].includes(spec.name)) expect(last.islands[0].archived).toBe(false);
    if (spec.name === 'mixed-click-favorite') {
      expect(last.islands[0].archived).toBe(false);
      expect(last.pool[0].interestScore).toBeGreaterThan(0);
    }
    if (spec.name === 'not-interested') expect(last.pool[0].interestScore).toBeLessThan(0);
    if (spec.groups.length > 1) {
      expect(last.pool[0].interestScore).toBeGreaterThan(last.pool[1].interestScore);
      expect(last.pool[0].rank).toBeLessThan(last.pool[1].rank);
    }
    if (data.event) {
      await data.event.reload();
      expect(data.event.status).toBe('active');
      expect(data.event.articleCount).toBe(3);
    }
    results.push({ name: spec.name, snapshots });
  });

  it('preserves relative signal persistence at equal ages', () => {
    for (const day of days.slice(1)) {
      vi.setSystemTime(at(day));
      const contribution = name => computeArticleSignals(behavior([name])).positiveScore;
      expect(contribution('favorite')).toBeGreaterThan(contribution('click'));
      const retention = name => contribution(name) / signals[name][2];
      expect(retention('deep')).toBeGreaterThan(retention('click'));
      expect(retention('favorite')).toBeGreaterThan(retention('deep'));
      expect(retention('positive')).toBeGreaterThan(retention('favorite'));
      expect(computeArticleSignals(behavior(['favorite'], day)).positiveScore).toBeGreaterThan(contribution('favorite'));
    }
  });
});
