import { beforeAll, describe, expect, it } from 'vitest';

import db from '../../models/index.js';
import { compileItemFilter } from '../../services/crawl/filtering/itemFilter.js';
import processArticle from '../../services/crawl/orchestration/processArticle.js';

const { Article, Category, Feed, User } = db;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// This function builds one normalized publisher entry with stable revision identity.
const feedEntry = (externalId, overrides = {}) => ({
  externalId,
  externalIdType: 'guid',
  title: 'Accepted article',
  url: `https://example.com/item-filter/${externalId}`,
  contentBaseUrl: `https://example.com/item-filter/${externalId}`,
  content: `<p>Accepted article body ${externalId} with enough text for normal processing.</p>`,
  contentKind: 'html',
  description: 'Accepted article description',
  descriptionKind: 'text',
  author: 'RSSMonster Reporter',
  categories: ['Technology'],
  publishedAt: new Date('2026-09-01T10:00:00.000Z'),
  ...overrides
});

// This function runs an entry through the regular article orchestration with a feed filter.
const processFilteredEntry = (feed, entry, expression) => processArticle(
  feed,
  entry,
  [],
  null,
  { count: () => 0 },
  null,
  null,
  feed.feedName,
  'rss',
  {},
  compileItemFilter(expression)
);

describe('feed item filter persistence integration', () => {
  let feed;

  beforeAll(async () => {
    const username = uniqueName('item-filter-user');
    const user = await User.create({
      username,
      password: 'secret',
      feverCredentialHash: `${username}-hash`,
      role: 'user'
    });
    const category = await Category.create({
      userId: user.id,
      name: uniqueName('item-filter-category')
    });
    feed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Item filter integration feed',
      url: `https://example.com/${uniqueName('item-filter-feed')}.xml`,
      feedTags: [],
      applyAiAnalysis: false
    });
  });

  it('stores no identity for a rejection and evaluates it again after the filter changes', async () => {
    const externalId = uniqueName('reconsidered-guid');
    const entry = feedEntry(externalId, { title: 'Initially rejected article' });

    const rejected = await processFilteredEntry(feed, entry, 'title:/^Accepted/');

    expect(rejected).toEqual({
      newArticles: 0,
      updatedArticles: 0,
      errors: 0,
      filteredArticles: 1
    });
    expect(await Article.findOne({
      where: { feedId: feed.id, externalId, externalIdType: 'guid' }
    })).toBeNull();

    const accepted = await processFilteredEntry(feed, entry, 'title:/rejected article$/');

    expect(accepted).toMatchObject({
      newArticles: 1,
      updatedArticles: 0,
      errors: 0
    });
    expect(await Article.findOne({
      where: { feedId: feed.id, externalId, externalIdType: 'guid' }
    })).toMatchObject({ title: 'Initially rejected article' });
  });

  it('keeps the last accepted revision when a later revision no longer matches', async () => {
    const externalId = uniqueName('revision-guid');
    const acceptedEntry = feedEntry(externalId);
    const acceptedContent = `Accepted article body ${externalId} with enough text for normal processing.`;
    const firstResult = await processFilteredEntry(
      feed,
      acceptedEntry,
      'title:/^Accepted/'
    );
    const stored = await Article.findOne({
      where: { feedId: feed.id, externalId, externalIdType: 'guid' }
    });

    expect(firstResult).toMatchObject({ newArticles: 1, updatedArticles: 0, errors: 0 });
    expect(stored).toMatchObject({
      title: 'Accepted article',
      contentText: acceptedContent
    });

    const rejectedRevision = feedEntry(externalId, {
      title: 'Publisher changed the title',
      content: '<p>This revised body must not replace the accepted version.</p>',
      modifiedAt: new Date('2026-09-02T10:00:00.000Z')
    });
    const revisionResult = await processFilteredEntry(
      feed,
      rejectedRevision,
      'title:/^Accepted/'
    );

    expect(revisionResult).toEqual({
      newArticles: 0,
      updatedArticles: 0,
      errors: 0,
      filteredArticles: 1
    });
    expect(await Article.count({
      where: { feedId: feed.id, externalId, externalIdType: 'guid' }
    })).toBe(1);
    await stored.reload();
    expect(stored).toMatchObject({
      title: 'Accepted article',
      contentText: acceptedContent
    });
  });

  it('applies negated field filters to normalized category values', async () => {
    const externalId = uniqueName('category-guid');
    const rejected = await processFilteredEntry(
      feed,
      feedEntry(externalId),
      '!category:/technology/i'
    );

    expect(rejected).toMatchObject({ filteredArticles: 1 });
    expect(await Article.findOne({
      where: { feedId: feed.id, externalId, externalIdType: 'guid' }
    })).toBeNull();
  });
});
