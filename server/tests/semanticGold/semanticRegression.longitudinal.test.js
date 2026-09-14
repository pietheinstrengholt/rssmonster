import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { readSemanticFixtureFile as readFile } from '../helpers/semanticBatchFixtures.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const longitudinalReportUrl = new URL('../.semantic-regression/batch-results.json', import.meta.url);

const fixture = JSON.parse(await readFile(new URL('../fixtures/semantic-regression-batch002.json', import.meta.url), 'utf8'));
const baseline = JSON.parse(await readFile(new URL('../fixtures/semantic-regression-batch001.json', import.meta.url), 'utf8'));
const all = new Map([...baseline.articles, ...fixture.articles].filter(a => a.sourceId).map(a => [a.sourceId, a]));
const same = (rows, key) => rows.length > 0 && rows.every(r => r?.[key] && r[key] === rows[0][key]);

const topicIds = row => (row?.topicMemberships || []).map(l => l.topicId);
const sharedTopics = rows => rows.length ? topicIds(rows[0]).filter(id => rows.every(r => topicIds(r).includes(id))) : [];
const separatedTopics = groups => groups.every(g => sharedTopics(g).length) && groups.every((g, i) =>
  groups.slice(i + 1).every(other => !sharedTopics(g).some(id => sharedTopics(other).includes(id))));

// One test per named gold scenario keeps failures visible without preventing later waves.
describe('longitudinal gold in the shared 1,000 + 1,000 corpus', () => {
  let report;
  beforeAll(async () => {
    report = JSON.parse(await readFile(longitudinalReportUrl, 'utf8'));
    expect(report.fixtureDigest, 'report must match the current batches').toBe(createHash('sha256').update(JSON.stringify([baseline, fixture])).digest('hex'));
    expect(report.phases).toHaveLength(2);
    report.initial = report.phases[0];
    report.final = report.phases[1];
    report.checks = [];
    report.waves = [report.phases[1]];
  });
  afterAll(async () => {
    if (!report) return;
    await writeFile(new URL('batch-gold-results.json', longitudinalReportUrl), JSON.stringify(report.checks, null, 2));
  });
  it('does not turn generic reporting words into shared durable subjects', () => {
    const byUrl = new Map(report.final.rows.map(a => [a.url, a]));
    const pairs = [['01', '21'], ['40', '22'], ['25', '32'], ['43', '48'], ['09', '05'], ['39', '20']];
    for (const [left, right] of pairs) {
      const groups = [left, right].map(number => {
        const scenario = fixture.longitudinalScenarios.find(s => s.id === `continuity-${number}`);
        return scenario.baseline.map(id => byUrl.get(all.get(id).url));
      });
      const common = sharedTopics(groups.flat());
      const check = { scenario: `cross-subject-${left}-${right}`, label: 'unrelated durable subjects have no shared Topic',
        pass: common.length === 0, classification: 'Topic identity defect', diagnosticTopicIds: common };
      report.checks.push(check);
      expect.soft(check.pass, check.scenario).toBe(true);
    }
  });

  for (const scenario of fixture.longitudinalScenarios) {
    it(`${scenario.id}: ${scenario.expect.join(', ')}`, async () => {
        const finalByUrl = new Map(report.final.rows.map(a => [a.url, a]));
      const initialByUrl = new Map(report.initial.rows.map(a => [a.url, a]));
      const rows = ids => ids.map(id => finalByUrl.get(all.get(id)?.url));
      const checks = [];
      const check = (label, pass, classification) => {
        const value = { scenario: scenario.id, label, pass: Boolean(pass), classification };
        checks.push(value);
        expect.soft(value.pass, `${scenario.id}: ${label} [${classification}]`).toBe(true);
      };
      if (scenario.category === 'continuity') {
        const old = rows(scenario.baseline), follow = rows(scenario.follow), later = rows(scenario.later);
        check('follow-ups reuse established Event', same([...old, ...follow], 'eventId'), 'Event identity defect');
        check('later occurrence forms its own Event', same(later, 'eventId') && later[0].eventId !== old[0]?.eventId, 'Event identity defect');
        check('later occurrence reuses durable Topic', sharedTopics([...old, ...later]).length > 0, 'Topic identity defect');
        const initial = scenario.baseline.map(id => initialByUrl.get(all.get(id)?.url));
        check('initial Event membership remains stable', initial.every((a, i) => !a?.eventId || a.eventId === old[i]?.eventId), 'Event identity defect');
        check('durable Topic ID survives incremental competition', sharedTopics(initial).some(id => sharedTopics(old).includes(id)), 'Topic identity defect');
      } else if (scenario.groups) {
        const groups = scenario.groups.map(rows);
        check('independent coverage forms Events within groups', groups.every(g => same(g, 'eventId')), 'Event identity defect');
        check('distinct occurrences remain different Events', groups.every(g => g[0]?.eventId) && new Set(groups.map(g => g[0].eventId)).size === groups.length, 'Event identity defect');
        if (scenario.category === 'new-subject') check('new subject persists into later evaluation', sharedTopics(groups.flat()).length > 0, 'Topic identity defect');
        else if (scenario.expect.includes('different-topics')) check('unrelated subjects have separate Topics', separatedTopics(groups), 'Topic identity defect');
      } else if (scenario.category === 'held-out') {
        const held = report.heldOut.filter(h => h.scenario === scenario.id);
        for (const h of held) {
          check(`${h.sourceId}: bounded finite score`, Number.isFinite(h.interestScore) && Math.abs(h.interestScore) <= 1 && Number.isFinite(h.recommended), 'recommendation defect');
          if (h.expected === 'positive') check(`${h.sourceId}: positive generalization`, h.interestScore > 0, 'interest propagation defect');
          if (h.expected === 'emerging' && h.wave > Math.min(...held.map(a => a.wave))) {
            check(`${h.sourceId}: earlier feedback reaches later held-out coverage`, h.interestScore > 0, 'interest propagation defect');
          }
          if (h.expected === 'negative') check(`${h.sourceId}: retained explicit negative`, h.interestScore < 0, 'interest propagation defect');
          if (h.expected === 'neutral') check(`${h.sourceId}: neutral unrelated article`, Math.abs(h.interestScore) <= 0.01, 'interest propagation defect');
        }
        const cross = held.find(h => h.expected === 'attenuated');
        const compatible = held.filter(h => ['positive', 'negative'].includes(h.expected) || h.expected === 'emerging' && h.interestScore > 0);
        if (cross && compatible.length) check('cross-intent transfer weaker than strongest same-intent evidence',
          Math.abs(cross.interestScore) < Math.max(...compatible.map(h => Math.abs(h.interestScore))), 'interest propagation defect');
        if (scenario.sign === 'conflicting') {
          check('later dislike retains earlier explicit positive evidence', rows(scenario.baseline).some(a => a.favoriteInd) &&
            rows(scenario.held).some(a => a.negativeInd), 'interest propagation defect');
          check('conflicting evidence remains bounded after recalibration', rows(scenario.held).every(a =>
            Number.isFinite(a.interestScore) && Math.abs(a.interestScore) <= 1), 'interest propagation defect');
        }
      } else {
        const members = rows(scenario.members);
        if (scenario.expect.includes('same-event')) check('updates and language variation describe one occurrence', same(members, 'eventId'), 'Event identity defect');
        if (scenario.expect.includes('different-topics-endpoints')) check('gradual semantic chain does not collapse endpoints', separatedTopics([members.slice(0, 2), members.slice(-2)]), 'Topic identity defect');
        if (scenario.expect.includes('different-topics-endpoints')) check('every drift step has independent Event support',
          [0, 2, 4, 6].every(i => same(members.slice(i, i + 2), 'eventId')), 'Event identity defect');
        if (scenario.expect.includes('ambiguous-topic')) check('ambiguous subject reaches Topic evaluation', same(members, 'eventId'), 'Event identity defect');
        if (scenario.expect.includes('ambiguous-topic')) check('balanced two-subject reports do not force a primary', members.every(a => !a?.topicId), 'Topic identity defect');
        if (scenario.expect.includes('duplicate-distinct-from-event')) {
          check('exact syndication recognized', members.slice(0, 2).some(a => a?.duplicateOfArticleId), 'duplicate handling defect');
          const canonical = members.filter(a => !a?.duplicateOfArticleId);
          check('independent coverage still forms an Event', same(canonical, 'eventId'), 'Event identity defect');
        }
        check('all sparse/messy rows have finite Recommended', members.every(a => Number.isFinite(a?.recommended)), 'recommendation defect');
      }
      report.checks = [...report.checks.filter(c => c.scenario !== scenario.id), ...checks];
      const diagnosticIds = [...new Set([...(scenario.baseline || []), ...(scenario.follow || []), ...(scenario.later || []), ...(scenario.groups || []).flat(), ...(scenario.members || []), ...(scenario.held || [])])];
      console.log('[LONGITUDINAL GOLD]', JSON.stringify({ scenario: scenario.id, expected: scenario.expect,
        result: checks.every(c => c.pass) ? 'PASS' : 'FAIL', checks,
        articles: diagnosticIds.map(id => { const row = rows([id])[0]; return { sourceId: id, title: all.get(id)?.title, eventId: row?.eventId, topicId: row?.topicId, topicMemberships: row?.topicMemberships }; }) }));
    });
  }
});
