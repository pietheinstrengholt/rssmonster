import { beforeAll, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../../models/index.js';
import { createAndAssignEvent } from '../../services/events/createEvents.js';

const { Article, Category, Event, Feed, User, sequelize } = db;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// This function creates a persisted user and feed for event creation tests.
async function createUserGraph(prefix) {
  const username = uniqueName(prefix);
  const hash = await bcrypt.hash('secret', 4);
  const user = await User.create({
    username,
    password: 'secret',
    hash,
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

// This function creates a canonical article with an event vector.
async function createArticle(user, feed, label, status = 'unread') {
  return Article.create({
    userId: user.id,
    feedId: feed.id,
    title: `${label} article`,
    url: `https://example.com/${user.id}/${label}-${Date.now()}`,
    status,
    articleVector: [1, 0, 0]
  });
}

describe('createAndAssignEvent', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  });

  it('initializes both pointers and atomically links articles without changing status', async () => {
    const { user, feed } = await createUserGraph('event-creation');
    const candidateArticle = await createArticle(user, feed, 'candidate');
    const seedArticle = await createArticle(user, feed, 'seed', 'read');
    await candidateArticle.update({ articleVector: [0, 1, 0] });
    const transaction = await sequelize.transaction();

    try {
      const eventId = await createAndAssignEvent({
        candidateArticles: [candidateArticle],
        article: seedArticle,
        cache: null,
        skipTopicAssignment: true,
        transaction
      });

      const event = await Event.findByPk(eventId, { transaction });
      const linkedSeedArticle = await Article.findByPk(seedArticle.id, { transaction });

      expect(event.representativeArticleId).toBe(seedArticle.id);
      expect(event.developingArticleId).toBe(seedArticle.id);
      expect(event.eventVector).toEqual([0.5, 0.5, 0]);
      expect(linkedSeedArticle.eventId).toBe(event.id);
      expect(linkedSeedArticle.status).toBe('read');

      await transaction.rollback();

      expect(await Event.findByPk(eventId)).toBeNull();
      expect(await Article.findByPk(seedArticle.id)).toMatchObject({
        eventId: null,
        status: 'read'
      });
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  });

  it('commits a managed creation transaction before adding the event to the cache', async () => {
    const { user, feed } = await createUserGraph('managed-event-creation');
    const candidateArticle = await createArticle(user, feed, 'managed-candidate');
    const seedArticle = await createArticle(user, feed, 'managed-seed');
    const cache = { add: vi.fn() };

    const eventId = await createAndAssignEvent({
      candidateArticles: [candidateArticle],
      article: seedArticle,
      cache,
      skipTopicAssignment: true
    });

    const event = await Event.findByPk(eventId);
    await candidateArticle.reload();
    await seedArticle.reload();

    expect(event).not.toBeNull();
    expect(candidateArticle.eventId).toBe(eventId);
    expect(seedArticle.eventId).toBe(eventId);
    expect(cache.add).toHaveBeenCalledOnce();
    expect(cache.add).toHaveBeenCalledWith(expect.objectContaining({ id: eventId }));
  });

  it('rolls back managed creation failures without adding a phantom cache event', async () => {
    const { user, feed } = await createUserGraph('failed-event-creation');
    const candidateArticle = await createArticle(user, feed, 'failed-candidate');
    const seedArticle = await createArticle(user, feed, 'failed-seed');
    const cache = { add: vi.fn() };

    await expect(createAndAssignEvent({
      candidateArticles: [candidateArticle],
      article: seedArticle,
      cache,
      assignTopicsForEvent: async () => {
        throw new Error('topic synchronization failed');
      }
    })).rejects.toThrow('topic synchronization failed');

    await candidateArticle.reload();
    await seedArticle.reload();

    expect(await Event.count({ where: { userId: user.id } })).toBe(0);
    expect(candidateArticle.eventId).toBeNull();
    expect(seedArticle.eventId).toBeNull();
    expect(cache.add).not.toHaveBeenCalled();
  });

  it('allows only one concurrent event creation from the same unassigned evidence', async () => {
    const { user, feed } = await createUserGraph('competing-event-creation');
    const candidateArticle = await createArticle(user, feed, 'competing-candidate');
    const seedArticle = await createArticle(user, feed, 'competing-seed');
    const cache = { add: vi.fn() };
    const creation = () => createAndAssignEvent({
      candidateArticles: [candidateArticle],
      article: seedArticle,
      cache,
      skipTopicAssignment: true
    });

    const eventIds = await Promise.all([creation(), creation()]);
    const createdEventIds = eventIds.filter(Boolean);

    await candidateArticle.reload();
    await seedArticle.reload();

    expect(createdEventIds).toHaveLength(1);
    expect(await Event.count({ where: { userId: user.id } })).toBe(1);
    expect(candidateArticle.eventId).toBe(createdEventIds[0]);
    expect(seedArticle.eventId).toBe(createdEventIds[0]);
    expect(cache.add).toHaveBeenCalledOnce();
  });
});
