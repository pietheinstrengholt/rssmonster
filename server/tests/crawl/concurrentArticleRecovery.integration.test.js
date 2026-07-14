import { beforeAll, describe, expect, it } from 'vitest';

import db from '../../models/index.js';
import saveArticle from '../../services/crawl/saveArticle.js';
import updateArticle, {
  applyArticleUpdate
} from '../../services/crawl/updateArticle.js';

const { User, Category, Feed, Article } = db;

// This function returns a collision-safe test identifier.
const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// This function builds complete source data for persistence race tests.
const articleData = (suffix, overrides = {}) => ({
  link: `https://example.com/race/${suffix}`,
  normalizedUrl: `https://example.com/race/${suffix}`,
  title: `Race article ${suffix}`,
  author: 'Publisher',
  description: 'Article description',
  contentOriginal: `<p>Article body ${suffix}</p>`,
  contentHtml: `<p>Article body ${suffix}</p>`,
  contentText: `Article body ${suffix}`,
  contentTextHash: `text-hash-${suffix}`,
  contentSourceHash: `source-hash-${suffix}`,
  language: 'en',
  published: new Date('2026-07-14T00:00:00Z'),
  ...overrides
});

const analysis = {
  contentSummaryBullets: [],
  tags: [],
  advertisementScore: 70,
  sentimentScore: 70,
  qualityScore: 70
};

const actionResult = {
  status: 'unread',
  favoriteInd: false,
  clickedAmount: 0,
  hotInd: false,
  tags: []
};

describe('concurrent article recovery integration', () => {
  let feed;
  let secondFeed;

  beforeAll(async () => {
    const username = uniqueName('article-race-user');
    const user = await User.create({
      username,
      password: 'secret',
      hash: `${username}-hash`,
      role: 'user'
    });
    const category = await Category.create({
      userId: user.id,
      name: uniqueName('article-race-category')
    });
    feed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Article race feed',
      url: `https://example.com/${uniqueName('article-race-feed')}.xml`,
      feedTags: []
    });
    secondFeed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Second article race feed',
      url: `https://example.com/${uniqueName('second-article-race-feed')}.xml`,
      feedTags: []
    });
  });

  it('recovers and reconciles the exact raw-URL winner without external identity', async () => {
    const suffix = uniqueName('url');
    const link = `https://example.com/race/${suffix}`;
    const firstData = articleData(`${suffix}-first`, {
      link,
      normalizedUrl: `${link}/canonical-first`
    });
    const incomingData = articleData(`${suffix}-incoming`, {
      link,
      normalizedUrl: `${link}/canonical-incoming`,
      title: 'Newer concurrent title'
    });
    const first = await saveArticle(feed, firstData, analysis, actionResult);
    const raced = await saveArticle(feed, incomingData, analysis, actionResult);

    expect(first.created).toBe(true);
    expect(raced).toMatchObject({
      created: false,
      article: { id: first.article.id },
      conflict: { identity: 'urlHash', recovered: true }
    });

    const updatePlan = await updateArticle(feed, incomingData, {
      article: raced.article
    });
    expect(updatePlan).toMatchObject({
      matched: true,
      changed: true,
      changes: { titleChanged: true, contentChanged: true }
    });

    await applyArticleUpdate({ updatePlan, userId: feed.userId });
    const reconciled = await Article.findByPk(first.article.id);
    expect(reconciled.title).toBe('Newer concurrent title');
    expect(reconciled.contentOriginal).toBe(incomingData.contentOriginal);
  });

  it('recovers the exact normalized-URL winner for different raw URLs', async () => {
    const suffix = uniqueName('normalized');
    const normalizedUrl = `https://example.com/race/${suffix}`;
    const first = await saveArticle(feed, articleData(`${suffix}-first`, {
      link: `${normalizedUrl}?utm_source=first`,
      normalizedUrl
    }), analysis, actionResult);
    const raced = await saveArticle(feed, articleData(`${suffix}-incoming`, {
      link: `${normalizedUrl}?utm_source=incoming`,
      normalizedUrl
    }), analysis, actionResult);

    expect(first.created).toBe(true);
    expect(raced).toMatchObject({
      created: false,
      article: { id: first.article.id },
      conflict: { identity: 'normalizedUrlHash', recovered: true }
    });
  });

  it('recovers an exact filtered URL winner', async () => {
    const suffix = uniqueName('filtered-url');
    const link = `https://example.com/race/${suffix}`;
    const filteredResult = await saveArticle(feed, articleData(`${suffix}-filtered`, {
      link,
      normalizedUrl: link
    }), null, {
      ...actionResult,
      shouldDelete: true
    });
    const raced = await saveArticle(feed, articleData(`${suffix}-incoming`, {
      link,
      normalizedUrl: `${link}/revised`
    }), analysis, actionResult);

    expect(filteredResult).toMatchObject({
      created: true,
      article: { filteredInd: true }
    });
    expect(raced).toMatchObject({
      created: false,
      article: {
        id: filteredResult.article.id,
        filteredInd: true
      },
      conflict: { identity: 'urlHash', recovered: true }
    });
  });

  it('keeps same-content articles distinct and recovers the requested URL winner', async () => {
    const suffix = uniqueName('same-content');
    const sharedContent = {
      contentOriginal: '<p>Shared publisher body</p>',
      contentHtml: '<p>Shared publisher body</p>',
      contentText: 'Shared publisher body',
      contentTextHash: `shared-text-${suffix}`,
      contentSourceHash: `shared-source-${suffix}`
    };
    const older = await saveArticle(feed, articleData(`${suffix}-older`, {
      ...sharedContent
    }), analysis, actionResult);
    const urlWinner = await saveArticle(feed, articleData(`${suffix}-winner`, {
      ...sharedContent
    }), analysis, actionResult);
    const raced = await saveArticle(feed, articleData(`${suffix}-incoming`, {
      link: urlWinner.article.url,
      normalizedUrl: `${urlWinner.article.normalizedUrl}/revised`
    }), analysis, actionResult);

    expect(older.created).toBe(true);
    expect(urlWinner.created).toBe(true);
    expect(older.article.id).not.toBe(urlWinner.article.id);
    expect(raced).toMatchObject({
      created: false,
      article: { id: urlWinner.article.id },
      conflict: { identity: 'urlHash' }
    });
    expect(raced.article.id).not.toBe(older.article.id);
  });

  it('allows the same user source content to appear in different feeds', async () => {
    const suffix = uniqueName('cross-feed-content');
    const sharedContent = {
      contentOriginal: '<p>Cross-feed publisher body</p>',
      contentHtml: '<p>Cross-feed publisher body</p>',
      contentText: 'Cross-feed publisher body',
      contentTextHash: `cross-feed-text-${suffix}`,
      contentSourceHash: `cross-feed-source-${suffix}`
    };

    const first = await saveArticle(feed, articleData(`${suffix}-first`, {
      ...sharedContent
    }), analysis, actionResult);
    const second = await saveArticle(secondFeed, articleData(`${suffix}-second`, {
      ...sharedContent
    }), analysis, actionResult);

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(second.article.id).not.toBe(first.article.id);
    expect(second.article.feedId).toBe(secondFeed.id);
  });
});
