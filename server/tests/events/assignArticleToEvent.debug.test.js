import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

const previousEventDebug = process.env.EVENT_DEBUG;
process.env.EVENT_DEBUG = 'true';

const { default: db } = await import('../../models/index.js');
const {
  default: assignArticleToEvent,
  EventCache
} = await import('../../services/events/assignArticleToEvent.js');

const { Article, Category, Event, Feed, User, sequelize } = db;

// This function creates the owned user and feed required by debug assignment tests.
async function createUserGraph(prefix) {
  const username = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await User.create({
    username,
    password: 'secret',
    feverCredentialHash: await bcrypt.hash('secret', 4),
    role: 'user'
  });
  const category = await Category.create({
    userId: user.id,
    name: `${username} category`,
    categoryOrder: 0
  });
  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: `${username} feed`,
    url: `https://example.com/${username}.xml`
  });

  return { user, feed };
}

// This function creates recent canonical coverage with a stable semantic vector.
async function createArticle(user, feed, label, offsetMinutes = 0) {
  const publishedAt = new Date(Date.now() - (60 - offsetMinutes) * 60 * 1000);
  return Article.create({
    userId: user.id,
    feedId: feed.id,
    title: `Acme merger receives final approval ${label}`,
    url: `https://example.com/${user.id}/${label}-${Date.now()}`,
    publishedAt,
    createdAt: publishedAt,
    status: 'unread',
    articleVector: [1, 0, 0]
  });
}

describe('assignArticleToEvent debug diagnostics', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    if (previousEventDebug == null) {
      delete process.env.EVENT_DEBUG;
    } else {
      process.env.EVENT_DEBUG = previousEventDebug;
    }
  });

  it('logs accepted existing-event diagnostics and the selected assignment', async () => {
    const { user, feed } = await createUserGraph('debug-existing-event');
    const representativeArticle = await createArticle(user, feed, 'representative');
    const incomingArticle = await createArticle(user, feed, 'incoming', 5);
    const event = await Event.create({
      userId: user.id,
      representativeArticleId: representativeArticle.id,
      developingArticleId: representativeArticle.id,
      name: representativeArticle.title,
      articleCount: 1,
      sourceCount: 1,
      eventStrength: 0.7,
      eventVector: [1, 0, 0],
      eventWindowStartAt: representativeArticle.publishedAt,
      eventWindowEndAt: representativeArticle.publishedAt,
      status: 'active'
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const runContext = { records: [], stats: {} };

    await representativeArticle.update({ eventId: event.id });

    await expect(assignArticleToEvent(
      incomingArticle,
      new EventCache([event]),
      null,
      [],
      runContext,
      { skipTopicAssignment: true }
    )).resolves.toBe(event.id);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`article=${incomingArticle.id} existing-event-eval`),
      expect.objectContaining({
        topMatches: [expect.objectContaining({ eventId: event.id, accepted: true })]
      })
    );
    expect(runContext.records).toContainEqual(expect.objectContaining({
      id: incomingArticle.id,
      eventId: event.id
    }));
  });

  it('logs candidate evaluation and candidate-backed event selection', async () => {
    const { user, feed } = await createUserGraph('debug-candidate-event');
    const firstCandidate = await createArticle(user, feed, 'first-candidate');
    const secondCandidate = await createArticle(user, feed, 'second-candidate', 2);
    const incomingArticle = await createArticle(user, feed, 'candidate-incoming', 4);
    const event = await Event.create({
      userId: user.id,
      representativeArticleId: firstCandidate.id,
      developingArticleId: firstCandidate.id,
      name: 'Unrelated event centroid',
      articleCount: 2,
      sourceCount: 1,
      eventStrength: 0.7,
      eventVector: [0, 1, 0],
      eventWindowStartAt: firstCandidate.publishedAt,
      eventWindowEndAt: secondCandidate.publishedAt,
      status: 'active'
    });
    const articleCandidateCache = {
      findNearby: vi.fn().mockReturnValue([firstCandidate, secondCandidate]),
      updateEventId: vi.fn()
    };
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await Article.update(
      { eventId: event.id },
      { where: { id: [firstCandidate.id, secondCandidate.id] } }
    );
    firstCandidate.eventId = event.id;
    secondCandidate.eventId = event.id;

    await expect(assignArticleToEvent(
      incomingArticle,
      new EventCache([event]),
      null,
      [],
      { records: [], stats: {} },
      { skipTopicAssignment: true, articleCandidateCache }
    )).resolves.toBe(event.id);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`article=${incomingArticle.id} candidate-eval`),
      expect.objectContaining({
        assignedCandidateCount: 2,
        selectedCandidateEventId: event.id
      })
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`article=${incomingArticle.id} candidate-event-selected`),
      expect.objectContaining({ selectedCandidateEventId: event.id })
    );
    expect(articleCandidateCache.updateEventId).toHaveBeenCalledWith(
      [incomingArticle.id],
      event.id
    );
  });
});
