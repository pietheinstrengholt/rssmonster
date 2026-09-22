import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import assignArticleToEvent, { EventCache } from '../../services/events/assignArticleToEvent.js';
import ArticleEventCandidateCache from '../../services/events/ArticleEventCandidateCache.js';
import { createAndAssignEvent } from '../../services/events/createEvents.js';
import { assignArticleToExistingEvent } from '../../services/events/updateEvents.js';
import { eventClusteringFeedInclude } from '../../services/events/categoryClustering.js';

const { Article, Category, Event, Feed, User } = db;
const title = 'Acme releases the new compiler';
const at = hours => new Date(Date.now() - (96 - hours) * 3600000);
async function graph() {
  const username = `occurrence-${randomUUID()}`;
  const user = await User.create({ username, password: 'test', role: 'user' });
  const category = await Category.create({ userId: user.id, name: 'Tests', categoryOrder: 0 });
  const feed = await Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Tests', url: `https://example.com/${username}` });
  return { user, feed, category };
}
async function makeArticle(g, hours = 1, overrides = {}) {
  return Article.create({
    userId: g.user.id, feedId: g.feed.id, title, publishedAt: at(hours),
    embedding_model: 'test-model', articleVector: [1, 0], url: `https://example.com/${randomUUID()}`, ...overrides
  });
}
async function makeEvent(g, hours = 0, overrides = {}) {
  const member = await makeArticle(g, hours);
  const event = await Event.create({
    userId: g.user.id, name: title, representativeArticleId: member.id,
    articleCount: 1, sourceCount: 1, embedding_model: 'test-model', eventVector: [1, 0],
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
  const id = await assignArticleToEvent(incoming, new EventCache(events), null, context, {
    articleCandidateCache, ...options
  });
  await incoming.reload();
  return { id, context };
}

describe('Event occurrence assignment', () => {
  afterEach(() => vi.restoreAllMocks());

  describe.each(['object', 'id', 'preloaded', 'commit'])('category thresholds through %s assignment', path => {
    it.each([
      ['aggressive', 0.80, true], ['aggressive', 0.77, false],
      ['moderate', 0.85, true], ['moderate', 0.83, false],
      ['conservative', 0.90, true], ['conservative', 0.88, false],
      [null, 0.85, true], [null, 0.83, false]
    ])('%s accepts similarity %s: %s', async (clusteringBehavior, similarity, accepted) => {
      const g = await graph();
      const { event } = await makeEvent(g);
      await makeArticle(g, 0, { eventId: event.id });
      // The incoming category controls attachment, regardless of the members' preference.
      await g.category.update({ clusteringBehavior: 'conservative' });
      const category = await Category.create({ userId: g.user.id, name: 'Incoming', clusteringBehavior });
      const feed = await Feed.create({ userId: g.user.id, categoryId: category.id, feedName: 'Incoming', url: `https://example.com/${randomUUID()}` });
      const incoming = await makeArticle(g, 1, {
        feedId: feed.id, title: 'Acme compiler gains improved diagnostics',
        articleVector: [similarity, Math.sqrt(1 - similarity ** 2)]
      });
      const input = path === 'id' ? incoming.id : path === 'preloaded'
        ? await Article.findByPk(incoming.id, { include: [eventClusteringFeedInclude] }) : incoming;
      const result = path === 'commit'
        ? await assignArticleToExistingEvent({ article: incoming, bestEvent: event })
        : await assignArticleToEvent(input, new EventCache([event]), null, { records: [], stats: {} });
      expect(result).toBe(accepted ? event.id : null);
      expect((await incoming.reload()).eventId).toBe(accepted ? event.id : null);
    });
  });

  it.each(['no-vector', 'insufficient', 'ambiguous', 'seed-rejected', 'join-rejected'])(
    'preserves a concurrent committed assignment after a stale %s proposal', async outcome => {
      const g = await graph();
      const incoming = await makeArticle(g);
      const stale = await Article.findByPk(incoming.id);
      const winner = await makeEvent(g);
      // The first worker retains its unassigned snapshot while another commits.
      expect(await assignArticleToExistingEvent({ article: incoming, bestEvent: winner.event })).toBe(winner.event.id);
      const committedProjection = (await winner.event.reload()).toJSON();
      const events = [];
      const candidates = new ArticleEventCandidateCache({ userId: g.user.id });
      if (outcome === 'no-vector') stale.articleVector = null;
      if (outcome === 'ambiguous' || outcome === 'join-rejected') {
        const first = await makeEvent(g);
        events.push(first.event);
        if (outcome === 'ambiguous') {
          const second = await makeEvent(g);
          await second.event.update({ eventWindowStartAt: first.member.publishedAt, eventWindowEndAt: first.member.publishedAt });
          events.push(second.event);
        }
      }
      if (outcome === 'seed-rejected') {
        const neighbor = await makeArticle(g, 0, { articleVector: [0, 1] });
        candidates.insert({ ...neighbor.toJSON(), articleVector: [1, 0] });
      }
      const updateCache = vi.spyOn(candidates, 'updateEventId');
      const context = { records: [], stats: {} };
      const result = await assignArticleToEvent(stale, new EventCache(events), null, context, {
        articleCandidateCache: candidates
      });
      expect(result).toBe(winner.event.id);
      expect(stale.eventId).toBe(winner.event.id);
      expect((await incoming.reload()).eventId).toBe(winner.event.id);
      expect((await winner.event.reload()).toJSON()).toEqual(committedProjection);
      expect(context.records).toContainEqual(expect.objectContaining({ id: incoming.id, eventId: winner.event.id }));
      expect(context.lastDecision.reasons).toEqual(['membership_already_assigned']);
      expect(updateCache).toHaveBeenCalledWith([incoming.id], winner.event.id);
    }
  );

  it.each(['commit', 'rollback'])('observes a pending assignment only after its %s', async completion => {
    const g = await graph();
    const incoming = await makeArticle(g);
    const stale = await Article.findByPk(incoming.id);
    const { event } = await makeEvent(g);
    const transaction = await db.sequelize.transaction();
    let pending;
    try {
      await assignArticleToExistingEvent({ article: incoming, bestEvent: event, transaction });
      let reachedRead;
      const reading = new Promise(resolve => { reachedRead = resolve; });
      const findOne = Article.findOne.bind(Article);
      vi.spyOn(Article, 'findOne').mockImplementation(options => {
        if (options.where.id === incoming.id && options.attributes?.length === 2) reachedRead();
        return findOne(options);
      });
      const context = { records: [], stats: {} };
      pending = assignArticleToEvent(stale, new EventCache([]), null, context);
      await reading;
      await transaction[completion]();
      const expectedId = completion === 'commit' ? event.id : null;
      expect(await pending).toBe(expectedId);
      expect((await incoming.reload()).eventId).toBe(expectedId);
      expect((await event.reload()).articleCount).toBe(completion === 'commit' ? 2 : 1);
      expect(context.records).toContainEqual(expect.objectContaining({ id: incoming.id, eventId: expectedId }));
    } finally {
      if (!transaction.finished) await transaction.rollback();
      if (pending) await pending;
    }
  });

  it.each(['centroid-cache', 'member-cache', 'database'])('uses the same acceptance through %s', async source => {
    const g = await graph();
    const { event, member } = await makeEvent(g);
    const incoming = await makeArticle(g);
    if (source === 'database') {
      const context = null;
      expect(await assignArticleToEvent(incoming, null, null, context, {  })).toBe(event.id);
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
    const latest = await makeArticle(g, 40, { eventId: event.id });
    await event.update({ eventWindowEndAt: latest.publishedAt, articleCount: 2 });
    const incoming = await makeArticle(g, 72);
    const result = await assign(g, incoming, [], [latest]);
    expect(result.id).toBeNull();
    expect(incoming.eventId).toBeNull();
    expect(result.context.lastDecision.topMatches[0].reasons).toContain('event_span_exceeded');
    expect(await Event.count({ where: { userId: g.user.id } })).toBe(1);
  });

  it('rejects an opposite-side seed group without partial membership writes', async () => {
    const g = await graph();
    const seed = await makeArticle(g, 40);
    const left = await makeArticle(g, 0);
    const right = await makeArticle(g, 80);
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

    await second.event.update({ embedding_model: 'test-model', eventVector: [0, 1], name: 'An unrelated occurrence' });
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
    const stale = { id: event.id, userId: g.user.id, name: title, embedding_model: 'test-model', eventVector: [1, 0], eventWindowStartAt: at(40), eventWindowEndAt: at(40) };
    const incoming = await makeArticle(g, 60);
    const cache = { updateInMemory: vi.fn() };
    expect(await assignArticleToExistingEvent({ article: incoming, bestEvent: stale, cache })).toBeNull();
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
    expect(await assignArticleToExistingEvent({ article: incoming, bestEvent: event, cache })).toBeNull();
    expect((await incoming.reload()).eventId).toBeNull();
    expect((await event.reload()).articleCount).toBe(2);
    expect(cache.updateInMemory).not.toHaveBeenCalled();
  });

  it('serializes competing extensions so their combined span cannot exceed the window', async () => {
    const g = await graph();
    const { event } = await makeEvent(g, 40);
    const left = await makeArticle(g, 2);
    const right = await makeArticle(g, 78);
    const results = await Promise.all([left, right].map(incoming => assignArticleToExistingEvent({
      article: incoming, bestEvent: event, cache: null
    })));
    expect(results.filter(Boolean)).toHaveLength(1);
    await event.reload();
    expect(event.articleCount).toBe(2);
    expect((new Date(event.eventWindowEndAt) - new Date(event.eventWindowStartAt)) / 3600000).toBeLessThan(48);
  });

  it('rejects incompatible persisted seed evidence even if the caller supplied compatible vectors', async () => {
    const g = await graph();
    const seed = await makeArticle(g);
    const neighbor = await makeArticle(g, 0, { articleVector: [0, 1] });
    expect(await createAndAssignEvent({ article: seed, candidateArticles: [{ ...neighbor.toJSON(), articleVector: [1, 0] }] })).toBeNull();
    expect(await Event.count({ where: { userId: g.user.id } })).toBe(0);
  });
  it.each(['database', 'centroid-cache', 'member-cache'])('keeps incompatible Events unchanged through %s', async source => {
    const g = await graph();
    const { event, member } = await makeEvent(g);
    const incoming = await makeArticle(g, 1, { embedding_model: 'other-model' });
    const result = source === 'database'
      ? await assignArticleToEvent(incoming)
      : (await assign(g, incoming, source === 'centroid-cache' ? [event] : [], [member])).id;
    expect(result).toBeNull();
    expect(await assignArticleToExistingEvent({ article: incoming, bestEvent: event })).toBeNull();
    await incoming.reload();
    await event.reload();
    expect(incoming.eventId).toBeNull();
    expect(event.articleCount).toBe(1);
    expect(event.embedding_model).toBe('test-model');
  });

  it('rejects an in-flight supplied vector if the stored model changed before commit', async () => {
    const g = await graph();
    const { event } = await makeEvent(g, 0, { embedding_model: 'new-model' });
    const incoming = await makeArticle(g);
    await Article.update({ embedding_model: 'new-model' }, { where: { id: incoming.id } });
    expect(await assignArticleToExistingEvent({ article: incoming, articleEventVector: incoming.articleVector, bestEvent: event })).toBeNull();
    await incoming.reload();
    expect(incoming.eventId).toBeNull();
  });

});
