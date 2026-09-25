import { beforeAll, describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import tagController from '../../controllers/tag.js';

const { User, Category, Feed, Article, Event, Tag, BriefingPreference } = db;
let owner;
let foreign;
let feed;

const article = (title, values = {}) => Article.create({
  userId: owner.id, feedId: feed.id, title, status: 'read', ...values
});
const tag = (article, name, userId = owner.id) => Tag.create({ articleId: article.id, userId, name });
const readTags = async query => {
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await tagController.getTags({ userData: { userId: owner.id }, query: { status: 'read', ...query } }, res);
  expect(res.code).toBe(200);
  return res.body.tags.map(row => ({ name: row.name, count: Number(row.count) }));
};

describe('Read Top Tags aggregation', () => {
  beforeAll(async () => {
    owner = await User.create({ username: 'tag-aggregation-owner', password: 'test', feverCredentialHash: 'tag-owner-hash' });
    foreign = await User.create({ username: 'tag-aggregation-foreign', password: 'test', feverCredentialHash: 'tag-foreign-hash' });
    const category = await Category.create({ userId: owner.id, name: 'Tags' });
    const foreignCategory = await Category.create({ userId: foreign.id, name: 'Foreign tags' });
    feed = await Feed.create({ userId: owner.id, categoryId: category.id, feedName: 'Tags', url: 'https://example.com/tag-aggregation.xml' });
    const foreignFeed = await Feed.create({ userId: foreign.id, categoryId: foreignCategory.id, feedName: 'Foreign tags', url: 'https://example.com/foreign-tags.xml' });
    const standalone = await article('Standalone');
    await tag(standalone, 'alpha');
    await tag(standalone, 'beta');
    await tag(standalone, 'foreign-tag', foreign.id);
    await tag(await article('Filtered', { filteredInd: true }), 'excluded');
    await tag(await article('Duplicate', { duplicateOfArticleId: standalone.id }), 'excluded');
    await tag(await article('Unread', { status: 'unread' }), 'unread');
    await tag(await article('Foreign', { userId: foreign.id, feedId: foreignFeed.id }), 'excluded', foreign.id);

    const representative = await article('Representative');
    const developing = await article('Developing');
    const sibling = await article('Sibling');
    const event = await Event.create({ userId: owner.id, representativeArticleId: representative.id, developingArticleId: developing.id });
    await Article.update({ eventId: event.id }, { where: { id: [representative.id, developing.id, sibling.id] } });
    await tag(representative, 'alpha');
    await tag(developing, 'beta');
    await tag(sibling, 'sibling');
  });

  it('keeps ownership, visibility, status and alphabetical tie ordering', async () => {
    expect(await readTags({})).toEqual([
      { name: 'alpha', count: 2 }, { name: 'beta', count: 2 }, { name: 'sibling', count: 1 }
    ]);
  });

  it('counts only the selected event representative', async () => {
    expect(await readTags({ grouping: 'event' })).toEqual([
      { name: 'alpha', count: 2 }, { name: 'beta', count: 1 }
    ]);
    expect(await readTags({ grouping: 'event', includeDevelopingEvents: 'true' })).toEqual([
      { name: 'beta', count: 2 }, { name: 'alpha', count: 1 }
    ]);
  });

  it('applies the Hot preference to Daily Briefing tags even with matching interest', async () => {
    const hot = await article('Hot briefing tag', { hotInd: 1, interestScore: 0.8, publishedAt: new Date() });
    await tag(hot, 'hot-briefing');
    const preferences = await BriefingPreference.create({ userId: owner.id, includeHotArticles: true });
    try {
      expect(await readTags({ status: 'briefing' })).toContainEqual({ name: 'hot-briefing', count: 1 });
      await preferences.update({ includeHotArticles: false });
      expect(await readTags({ status: 'briefing' })).not.toContainEqual({ name: 'hot-briefing', count: 1 });
    } finally {
      await preferences.destroy();
      await hot.destroy();
    }
  });

  it('preserves the unread collection', async () => {
    expect(await readTags({ status: 'unread' })).toEqual([{ name: 'unread', count: 1 }]);
  });
});
