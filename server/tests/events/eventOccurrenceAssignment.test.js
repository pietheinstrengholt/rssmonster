import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import assignArticleToEvent, { EventCache } from '../../services/events/assignArticleToEvent.js';
import ArticleEventCandidateCache from '../../services/events/ArticleEventCandidateCache.js';
import { createAndAssignEvent } from '../../services/events/createEvents.js';
import { assignArticleToExistingEvent } from '../../services/events/updateEvents.js';

const { Article, Category, Event, Feed, User } = db;
const title = 'Acme releases the new compiler';
const at = hours => new Date(Date.now() - (48 - hours) * 3600000);
async function graph() {
  const username = `occurrence-${randomUUID()}`;
  const user = await User.create({ username, password: 'test', role: 'user' });
  const category = await Category.create({ userId: user.id, name: 'Tests', categoryOrder: 0 });
  const feed = await Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Tests', url: `https://example.com/${username}` });
  return { user, feed };
}
async function makeArticle(g, hours = 1, overrides = {}) {
  return Article.create({
    userId: g.user.id, feedId: g.feed.id, title, publishedAt: at(hours),
    articleVector: [1, 0], url: `https://example.com/${randomUUID()}`, ...overrides
  });
}
async function makeEvent(g, hours = 0, overrides = {}) {
  const member = await makeArticle(g, hours);
  const event = await Event.create({
    userId: g.user.id, name: title, representativeArticleId: member.id,
    articleCount: 1, sourceCount: 1, eventVector: [1, 0],
    eventWindowStartAt: member.publishedAt, eventWindowEndAt: member.publishedAt,
    ...overrides
  });
  await member.update({ eventId: event.id });
  return { event, member };
}

async function assign(g, incoming, events, members = [], options = {}) {
  const articleCandidateCache = new ArticleEventCandidateCache({ userId: g.user.id });
  for (const member of members) articleCandidateCache.insert(member);
  const context = { records: [], stats: {} };
  const id = await assignArticleToEvent(incoming, new EventCache(events), null, [], context, {
    skipTopicAssignment: true, articleCandidateCache, ...options
  });
  await incoming.reload();
  return { id, context };
}

describe('Event occurrence assignment', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['centroid-cache', 'member-cache', 'database'])('uses the same acceptance through %s', async source => {
    const g = await graph();
    const { event, member } = await makeEvent(g);
    const incoming = await makeArticle(g);
    if (source === 'database') {
      const context = null;
      expect(await assignArticleToEvent(incoming, null, null, [], context, { skipTopicAssignment: true })).toBe(event.id);
    } else {
      const result = await assign(g, incoming, source === 'centroid-cache' ? [event] : [], [member]);
      expect(result.id).toBe(event.id);
      expect(result.context.lastDecision).toMatchObject({ decision: 'join', reasons: expect.arrayContaining(['temporal_match']) });
    }
    await incoming.reload();
    expect(incoming.eventId).toBe(event.id);
    await event.reload();
    expect(event.representativeArticleId).toBe(member.id);
    expect(event.articleCount).toBe(2);
  });

  it('rejects temporal chaining even when only the latest member discovers the Event', async () => {
    const g = await graph();
    const { event } = await makeEvent(g, 0);
    const latest = await makeArticle(g, 20, { eventId: event.id });
    await event.update({ eventWindowEndAt: latest.publishedAt, articleCount: 2 });
    const incoming = await makeArticle(g, 36);
    const result = await assign(g, incoming, [], [latest]);
    expect(result.id).toBeNull();
    expect(incoming.eventId).toBeNull();
    expect(result.context.lastDecision.topMatches[0].reasons).toContain('event_span_exceeded');
    expect(await Event.count({ where: { userId: g.user.id } })).toBe(1);
  });

  it('rejects an opposite-side seed group without partial membership writes', async () => {
    const g = await graph();
    const seed = await makeArticle(g, 20);
    const left = await makeArticle(g, 0);
    const right = await makeArticle(g, 40);
    const result = await assign(g, seed, [], [left, right]);
    expect(result.id).toBeNull();
    expect(await Event.count({ where: { userId: g.user.id } })).toBe(0);
    expect(await Article.count({ where: { userId: g.user.id, eventId: null } })).toBe(3);
  });

  it('leaves ambiguous coverage unassigned and can reconsider it after evidence changes', async () => {
    const g = await graph();
    const first = await makeEvent(g);
    const second = await makeEvent(g);
    // Equal clocks remove ingestion timing noise from an intentional score tie.
    await second.event.update({ eventWindowStartAt: first.member.publishedAt, eventWindowEndAt: first.member.publishedAt });
    const incoming = await makeArticle(g);
    const standalone = await makeArticle(g, 0.5);
    const result = await assign(g, incoming, [first.event, second.event], [standalone]);
    expect(result.id).toBeNull();
    expect(incoming.eventId).toBeNull();
    expect(result.context.lastDecision.decision).toBe('ambiguous');
    expect(result.context.stats.ambiguousArticleCount).toBe(1);
    expect(await Event.count({ where: { userId: g.user.id } })).toBe(2);

    await second.event.update({ eventVector: [0, 1], name: 'An unrelated occurrence' });
    const reconsidered = await assign(g, incoming, [first.event, second.event]);
    expect(reconsidered.id).toBe(first.event.id);
  });

  it('checks neighbor-discovered competitors even when a centroid already qualifies', async () => {
    const g = await graph();
    const first = await makeEvent(g);
    const second = await makeEvent(g);
    const incoming = await makeArticle(g);
    const result = await assign(g, incoming, [first.event], [second.member]);
    expect(result.id).toBeNull();
    expect(result.context.lastDecision.decision).toBe('ambiguous');
  });

  it('creates a compatible Event when no existing Event qualifies', async () => {
    const g = await graph();
    const seed = await makeArticle(g, 2);
    const neighbor = await makeArticle(g, 1, { status: 'read' });
    const result = await assign(g, seed, [], [neighbor]);
    expect(result.id).toBeTruthy();
    expect(await Event.findByPk(result.id)).toMatchObject({ articleCount: 2 });
    expect((await neighbor.reload()).status).toBe('read');
  });

  it.each([{ filteredInd: true }, { status: 'duplicate' }])('excludes noncanonical input %j', async fields => {
    const g = await graph();
    const { event, member } = await makeEvent(g);
    const incoming = await makeArticle(g, 1, fields);
    const result = await assign(g, incoming, [event], [member]);
    expect(result.id).toBeNull();
    expect(incoming.eventId).toBeNull();
  });

  it('rejects foreign cached Event ownership and canonical duplicate input', async () => {
    const owner = await graph();
    const foreign = await graph();
    const { event } = await makeEvent(foreign);
    const incoming = await makeArticle(owner);
    expect((await assign(owner, incoming, [event])).id).toBeNull();
    const canonical = await makeArticle(owner);
    await incoming.update({ duplicateOfArticleId: canonical.id });
    expect((await assign(owner, incoming, [event])).id).toBeNull();
  });

  it('revalidates a stale cached span under the membership lock', async () => {
    const g = await graph();
    const { event } = await makeEvent(g, 0);
    const stale = { id: event.id, userId: g.user.id, name: title, eventVector: [1, 0], eventWindowStartAt: at(20), eventWindowEndAt: at(20) };
    const incoming = await makeArticle(g, 30);
    const cache = { updateInMemory: vi.fn() };
    expect(await assignArticleToExistingEvent({ article: incoming, bestEvent: stale, cache, skipTopicAssignment: true })).toBeNull();
    expect((await incoming.reload()).eventId).toBeNull();
    expect(cache.updateInMemory).not.toHaveBeenCalled();
  });

  it('rechecks occurrence consensus from committed members despite a misleading cached name', async () => {
    const g = await graph();
    const { event, member } = await makeEvent(g, 0, { name: 'Orion OS 4.3 released' });
    await member.update({ title: 'Orion OS 4.2 released' });
    await makeArticle(g, 0, { title: 'Orion OS 4.2 released', eventId: event.id });
    await event.update({ articleCount: 2 });
    const incoming = await makeArticle(g, 1, { title: 'Orion OS 4.3 released' });
    const cache = { updateInMemory: vi.fn() };
    expect(await assignArticleToExistingEvent({ article: incoming, bestEvent: event, cache, skipTopicAssignment: true })).toBeNull();
    expect((await incoming.reload()).eventId).toBeNull();
    expect((await event.reload()).articleCount).toBe(2);
    expect(cache.updateInMemory).not.toHaveBeenCalled();
  });

  it('serializes competing extensions so their combined span cannot exceed the window', async () => {
    const g = await graph();
    const { event } = await makeEvent(g, 20);
    const left = await makeArticle(g, 1);
    const right = await makeArticle(g, 39);
    const results = await Promise.all([left, right].map(incoming => assignArticleToExistingEvent({
      article: incoming, bestEvent: event, cache: null, skipTopicAssignment: true
    })));
    expect(results.filter(Boolean)).toHaveLength(1);
    await event.reload();
    expect(event.articleCount).toBe(2);
    expect((new Date(event.eventWindowEndAt) - new Date(event.eventWindowStartAt)) / 3600000).toBeLessThan(24);
  });

  it('rejects incompatible persisted seed evidence even if the caller supplied compatible vectors', async () => {
    const g = await graph();
    const seed = await makeArticle(g);
    const neighbor = await makeArticle(g, 0, { articleVector: [0, 1] });
    expect(await createAndAssignEvent({ article: seed, candidateArticles: [{ ...neighbor.toJSON(), articleVector: [1, 0] }], skipTopicAssignment: true })).toBeNull();
    expect(await Event.count({ where: { userId: g.user.id } })).toBe(0);
  });
});
