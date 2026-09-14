import { topicDiagnosticChannel } from '../../services/topics/event/topicDecisionDiagnostics.js';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { assignTopicsForEvents } from '../../services/topics/event/eventTopicAssignment.js';

const fixture = JSON.parse(await readFile(new URL('../fixtures/semantic-topic-gold.json', import.meta.url), 'utf8'));
const newUser = async () => {
  const user = await db.User.create({ username: `topic-gold-${randomUUID()}` });
  const category = await db.Category.create({ userId: user.id, name: 'Topic gold' });
  await db.Feed.bulkCreate([1, 2].map(n => ({ userId: user.id, categoryId: category.id, feedName: `Source ${n}`, url: `https://topic-gold.test/${user.id}/${n}` })));
  return user;
};
const makeEvent = async (userId, input) => {
  const feeds = await db.Feed.findAll({ where: { userId }, order: [['id', 'ASC']] });
  const articles = await db.Article.bulkCreate([0, 1, 2].map(n => ({ userId, feedId: feeds[n % 2].id,
    title: input.title, url: `https://topic-gold.test/${randomUUID()}`, articleVector: input.vector, publishedAt: new Date(input.date) })));
  const event = await db.Event.create({ userId, name: input.title, eventVector: input.vector,
    representativeArticleId: articles[0].id, articleCount: 3, sourceCount: 2,
    eventWindowStartAt: new Date(input.date), eventWindowEndAt: new Date(input.date) });
  await db.Article.update({ eventId: event.id }, { where: { id: articles.map(a => a.id) } });
  return event;
};

const goldResults = [];
let decisions = [];
const listener = row => decisions.push(row);
beforeAll(() => topicDiagnosticChannel.subscribe(listener));
beforeEach(() => { decisions = []; });
afterAll(async () => {
  topicDiagnosticChannel.unsubscribe(listener);
  const dir = new URL('../.semantic-regression/', import.meta.url);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL('topic-gold.md', dir), '# Topic gold regression results\n\nControlled vectors isolate decision policy; Event and Topic IDs are diagnostic only.\n\n| Scenario | Expected | Actual | Result |\n| --- | --- | --- | --- |\n' + goldResults.map(r => `| ${r.scenario} | ${r.expected} | ${r.actual} | PASS |`).join('\n') + '\n');
});

describe('durable Topic identity gold cases with separate Events', () => {
  for (const scenario of fixture.scenarios) it(scenario.name, async () => {
    const user = await newUser();
    const events = [];
    const memberships = [];
    for (const input of scenario.events) {
      const event = await makeEvent(user.id, input);
      events.push(event);
      await assignTopicsForEvents(user.id, [event], { assignmentContext: 'incremental' });
      memberships.push(await db.EventTopic.findAll({ where: { eventId: event.id }, raw: true }));
    }
    expect(new Set(events.map(e => e.id)).size).toBe(events.length);
    expect(memberships.every(rows => rows.length > 0)).toBe(true);
    const ids = memberships.map(rows => rows[0].topicId);
    if (scenario.sameTopic) expect(new Set(ids).size, scenario.name).toBe(1);
    else expect(new Set(ids).size, scenario.name).toBe(events.length);
    const last = decisions.at(-1);
    if (scenario.name === 'product version continuity') {
      expect(memberships[1][0].confidence).toBeCloseTo(0.275);
      expect(Number(memberships[1][0].primaryInd)).toBe(0);
      const articleLinks = await db.ArticleTopic.findAll({ where: { topicId: ids[1] }, include: [{ model: db.Article, required: true, where: { eventId: events[1].id } }] });
      expect(articleLinks).toHaveLength(3);
      expect(articleLinks.every(link => Math.abs(link.confidence - 0.275) < 0.00001)).toBe(true);
    }
    if (scenario.sameTopic) expect(last.candidates.some(c => c.reasons.includes('durable_entity_match'))).toBe(true);
    else expect(last.candidates.some(c => c.reasons.includes('insufficient_subject_identity') || c.reasons.includes('different_incident_subject'))).toBe(true);
    goldResults.push({ scenario: scenario.name, expected: scenario.sameTopic ? 'same durable Topic' : 'different Topics', actual: `Events ${events.map(e => e.id).join(', ')} → Topics ${ids.join(', ')} (${last.outcome})` });
    console.table([{ scenario: scenario.name, expected: scenario.sameTopic ? 'same Topic' : 'different Topics', topicIds: ids.join(', '), eventIds: events.map(e => e.id).join(', '), result: 'PASS' }]);
  });

  it('does not force a primary between equally plausible Topics without durable subject evidence', async () => {
    const user = await newUser();
    for (const [title, vector] of [['Project Meridian starts research', [1, 0, 0]], ['Project Borealis starts research', [0.999, 0.0447101778, 0]]]) {
      const event = await makeEvent(user.id, { title, vector, date: '2025-01-01' });
      const topic = await db.Topic.create({ userId: user.id, name: title, topicKey: randomUUID(), topicVector: vector });
      await db.EventTopic.create({ eventId: event.id, topicId: topic.id, confidence: 1, primaryInd: true });
      await event.update({ topicId: topic.id });
    }
    const event = await makeEvent(user.id, { title: 'Research programme announces funding changes', vector: [1, 0.02, 0], date: '2026-09-10' });
    await assignTopicsForEvents(user.id, [event], { assignmentContext: 'incremental' });
    await event.reload();
    expect(event.topicId).toBeNull();
    expect(await db.EventTopic.count({ where: { eventId: event.id } })).toBe(0);
    expect(decisions.at(-1)).toMatchObject({ outcome: 'ambiguous' });
    expect(decisions.at(-1).candidates[0].reasons).toContain('ambiguous_topic_candidates');
    goldResults.push({ scenario: 'ambiguous candidates', expected: 'unassigned', actual: 'no primary or secondary relationship' });
  });

  it('does not average unrelated unassigned Events into a new Topic seed', async () => {
    const user = await newUser();
    const first = await makeEvent(user.id, { title: 'Rotterdam train collision injures passengers', vector: [1, 0, 0], date: '2026-08-01' });
    await makeEvent(user.id, { title: 'Antwerp train collision injures passengers', vector: [0.9, 0.4358898944, 0], date: '2026-08-01' });
    await assignTopicsForEvents(user.id, [first]);
    await first.reload();
    const topic = await db.Topic.findByPk(first.topicId);
    expect(topic.topicVector).toEqual([1, 0, 0]);
    goldResults.push({ scenario: 'unrelated seed contamination', expected: 'own subject vector', actual: 'unrelated seed excluded' });
  });

  it('does not treat identical generic wording or vector hashes as durable identity', async () => {
    const user = await newUser();
    const events = [];
    for (const date of ['2026-01-01', '2026-08-01']) {
      const event = await makeEvent(user.id, { title: 'Local officials announce public service plans', vector: [1, 0, 0], date });
      await assignTopicsForEvents(user.id, [event]);
      await event.reload();
      events.push(event);
    }
    expect(events[0].topicId).not.toBe(events[1].topicId);
    goldResults.push({ scenario: 'generic vector-key collision', expected: 'different Topics', actual: 'hash did not bypass subject checks' });
  });


  it('uses source Event evidence even when Topic display labels are misleading', async () => {
    const user = await newUser();
    const first = await makeEvent(user.id, { title: 'Project Nova opens research platform', vector: [1, 0, 0], date: '2025-01-01' });
    await assignTopicsForEvents(user.id, [first]);
    await first.reload();
    await db.Topic.update({ name: 'General digest', generatedName: 'Unrelated sports' }, { where: { id: first.topicId } });
    const second = await makeEvent(user.id, { title: 'Project Nova closes research platform', vector: [0.9, 0.4358898944, 0], date: '2026-01-01' });
    await assignTopicsForEvents(user.id, [second]);
    await second.reload();
    expect(second.topicId).toBe(first.topicId);
    goldResults.push({ scenario: 'presentation labels are not identity', expected: 'same source subject', actual: 'source Event evidence reused despite labels' });
  });

});
