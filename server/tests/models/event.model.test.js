import { beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../../models/index.js';

const { Article, Category, Event, Feed, User, sequelize } = db;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// This function creates a persisted user and feed for Event model tests.
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

// This function creates a persisted article for Event pointer tests.
async function createArticle(user, feed, label) {
  return Article.create({
    userId: user.id,
    feedId: feed.id,
    title: `${label} article`,
    url: `https://example.com/${user.id}/${label}-${Date.now()}`
  });
}

describe('Event model', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  });

  it('accepts a null developing article', async () => {
    const { user, feed } = await createUserGraph('event-null-developing');
    const representativeArticle = await createArticle(user, feed, 'representative');
    const event = await Event.create({
      userId: user.id,
      representativeArticleId: representativeArticle.id,
      developingArticleId: null
    });

    expect(event.developingArticleId).toBeNull();
  });

  it('accepts an article ID without changing the representative article', async () => {
    const { user, feed } = await createUserGraph('event-developing-id');
    const representativeArticle = await createArticle(user, feed, 'representative');
    const developingArticle = await createArticle(user, feed, 'developing');
    const event = await Event.create({
      userId: user.id,
      representativeArticleId: representativeArticle.id
    });

    await event.update({ developingArticleId: developingArticle.id });

    expect(event.developingArticleId).toBe(developingArticle.id);
    expect(event.representativeArticleId).toBe(representativeArticle.id);
  });

  it('loads representative and developing article associations independently', async () => {
    const { user, feed } = await createUserGraph('event-article-associations');
    const representativeArticle = await createArticle(user, feed, 'representative');
    const developingArticle = await createArticle(user, feed, 'developing');
    const event = await Event.create({
      userId: user.id,
      representativeArticleId: representativeArticle.id,
      developingArticleId: developingArticle.id
    });

    const loadedEvent = await Event.findByPk(event.id, {
      include: [
        { model: Article, as: 'representativeArticle' },
        { model: Article, as: 'developingArticle' }
      ]
    });

    expect(loadedEvent.representativeArticle.id).toBe(representativeArticle.id);
    expect(loadedEvent.developingArticle.id).toBe(developingArticle.id);
    expect(Event.associations.representativeArticle.foreignKey).toBe('representativeArticleId');
    expect(Event.associations.developingArticle.foreignKey).toBe('developingArticleId');
  });
});
