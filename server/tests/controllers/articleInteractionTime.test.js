import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { createFeverApiKey, createFeverCredentialHash, createGreaderAuthToken, createGreaderActionToken } from '../../utils/apiCredentials.js';
import { computeArticleSignals, buildInterestIslandProfilesForUser } from '../../services/islands/islandArticleProfiles.js';

let app;
let currentUserId;
const old = new Date('2022-01-01T00:00:00Z');
async function fixture() {
  const username = `clock-${randomUUID()}`;
  const key = createFeverApiKey(username, 'password');
  const user = await db.User.create({ username, password: 'unused', feverCredentialHash: createFeverCredentialHash(key) });
  currentUserId = user.id;
  const category = await db.Category.create({ userId: user.id, name: 'Time' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Time', url: `https://${username}.example/feed` });
  const article = await db.Article.create({ userId: user.id, feedId: feed.id, title: 'Old article', publishedAt: old, contentHtml: 'Short article body' });
  const authorization = `Bearer ${jwt.sign({ userId: user.id, username }, getJwtSecret())}`;
  const post = (action, body = {}, id = article.id) => request(app).post(`/api/articles/${action}${id ? `/${id}` : ''}`).set('Authorization', authorization).send(body);
  return { user, article, key, post };
}
const fresh = time => {
  expect(time).toBeInstanceOf(Date);
  expect(Math.abs(Date.now() - time.getTime())).toBeLessThan(10000);
};
beforeAll(async () => { process.env.DISABLE_LISTENER = 'true'; app = (await import('../../app.js')).default; }, 50000);

describe('Article interaction clocks across APIs', () => {
  afterEach(async () => {
    const jobs = await db.ProcessingJob.findAll({ where: { userId: currentUserId, type: 'personalization_refresh' } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('pending');
  });

  it('timestamps today’s favorite of a 2022 article, clears unfavorites, and supports bulk writes', async () => {
    const { article, post } = await fixture();
    expect((await post('markasfavorite', { update: 'mark' })).status).toBe(200);
    await article.reload(); fresh(article.favoritedAt);
    expect(article.publishedAt).toEqual(old);
    expect(article.favoriteInd).toBe(1);
    expect((await post('markasfavorite', { update: 'unmark', articleIds: [article.id] }, null)).status).toBe(200);
    await article.reload(); expect(article.favoritedAt).toBeNull(); expect(article.favoriteInd).toBe(0);
    expect((await post('markasfavorite', { update: 'mark', articleIds: [article.id] }, null)).status).toBe(200);
    await article.reload(); fresh(article.favoritedAt);
  });

  it('refreshes atomic repeated clicks, bulk clicks and mark/unmark state without resetting the counter', async () => {
    const { article, post } = await fixture();
    await article.update({ clickedAmount: 2, lastClickedAt: old });
    const responses = await Promise.all([post('markclicked'), post('markclicked')]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    await article.reload(); expect(article.clickedAmount).toBe(4); fresh(article.lastClickedAt);
    await article.update({ lastClickedAt: old });
    expect((await post('markclicked', { articleIds: [article.id] }, null)).status).toBe(200);
    await article.reload(); expect(article.clickedAmount).toBe(5); fresh(article.lastClickedAt);
    await article.update({ lastClickedAt: old });
    expect((await post('markclicked', { update: 'mark' })).status).toBe(200);
    await article.reload(); expect(article.clickedAmount).toBe(5); fresh(article.lastClickedAt);
    expect((await post('markclicked', { update: 'unmark' })).status).toBe(200);
    await article.reload(); expect(article.clickedAmount).toBe(0); expect(article.lastClickedAt).toBeNull();
  });

  it('uses independent explicit feedback clocks and clears the opposite state', async () => {
    const { article, post } = await fixture();
    expect((await post('markmorelikethis')).status).toBe(200);
    await article.reload(); fresh(article.positiveFeedbackAt); expect(article.negativeFeedbackAt).toBeNull();
    expect((await post('marknotinterested')).status).toBe(200);
    await article.reload(); fresh(article.negativeFeedbackAt); expect(article.positiveFeedbackAt).toBeNull();
    expect(article.negativeInd).toBe(1); expect(article.positiveInd).toBe(0);
  });

  it('refreshes deep reads on already-seen articles without attributing the interaction to Event siblings', async () => {
    const { user, article, post } = await fixture();
    await article.update({ firstSeen: old, attentionBucket: 3, lastMeaningfulReadAt: old });
    const event = await db.Event.create({ userId: user.id, name: 'Occurrence', representativeArticleId: article.id });
    await article.update({ eventId: event.id });
    const sibling = await db.Article.create({ userId: user.id, feedId: article.feedId, title: 'Sibling', publishedAt: old, eventId: event.id });
    expect((await post('markasseen', { visibleSeconds: 30, grouping: 'event', selectedStatus: 'read' })).status).toBe(200);
    await article.reload(); fresh(article.lastMeaningfulReadAt); expect(article.firstSeen).toEqual(old);
    await sibling.reload(); expect(sibling.lastMeaningfulReadAt).toBeNull();
    await article.update({ lastMeaningfulReadAt: old });
    expect((await post('markasseen', { visibleSeconds: 1, selectedStatus: 'read' })).status).toBe(200);
    await article.reload(); expect(article.lastMeaningfulReadAt).toEqual(old);
  });

  it('timestamps Fever saved/unsaved mutations', async () => {
    const { article, key } = await fixture();
    for (const state of ['saved', 'unsaved']) {
      const response = await request(app).post('/api/fever').type('form').send({ api_key: key, mark: 'item', as: state, id: article.id });
      expect(response.status).toBe(200); expect(response.body.auth).toBe(1);
      await article.reload();
      if (state === 'saved') fresh(article.favoritedAt);
      else expect(article.favoritedAt).toBeNull();
    }
  });

  it('timestamps GReader starring and clearing with existing remove-wins semantics', async () => {
    const { user, article } = await fixture();
    const token = createGreaderAuthToken(user);
    const star = 'user/-/state/com.google/starred';
    for (const removing of [false, true]) {
      const response = await request(app).post('/api/greader/reader/api/0/edit-tag')
        .set('Authorization', `GoogleLogin auth=${user.username}/${token}`)
        .send({ i: article.id, a: star, ...(removing ? { r: star } : {}), T: createGreaderActionToken(user, token) });
      expect(response.status).toBe(200);
      await article.reload();
      if (removing) expect(article.favoritedAt).toBeNull();
      else fresh(article.favoritedAt);
    }
  });
});

describe('observed Article attention evidence', () => {
  it('upgrades a skim to a deep read, preserves firstSeen, and queues fresh Island evidence', async () => {
    const { user, article, post } = await fixture();
    await article.update({ embedding_model: 'test-model', articleVector: [1, 0] });
    expect((await post('markasseen', { visibleSeconds: 1 })).status).toBe(200);
    await article.reload();
    expect(article.attentionBucket).toBe(1);
    expect(article.lastMeaningfulReadAt).toBeNull();
    expect(await db.ProcessingJob.count({ where: { userId: user.id } })).toBe(0);
    expect(await buildInterestIslandProfilesForUser(user.id)).toHaveLength(0);
    const firstSeen = article.firstSeen;

    const response = await post('markasseen', { visibleSeconds: 15 });
    expect(response.status).toBe(200);
    expect(response.body.attentionBucket).toBe(3);
    await article.reload();
    expect(article.attentionBucket).toBe(3);
    expect(article.firstSeen).toEqual(firstSeen);
    fresh(article.lastMeaningfulReadAt);
    expect(article.publishedAt).toEqual(old);
    const signals = computeArticleSignals(article);
    expect(signals.positiveSignals.deepReads).toBe(1);
    expect(signals.positiveScore).toBeCloseTo(1);
    const profiles = await buildInterestIslandProfilesForUser(user.id);
    expect(profiles.flatMap(profile => profile.articles).map(row => row.articleId)).toEqual([article.id]);
    expect(profiles[0].articles[0].score).toBeCloseTo(1);
    const jobs = await db.ProcessingJob.findAll({ where: { userId: user.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].type).toBe('personalization_refresh');
    expect(jobs[0].status).toBe('pending');
    expect(jobs[0].payload.triggerReasons).toEqual(['deep-read']);
  });

  it.each([[4, 5], [2, 5], [4, 1]])('preserves bucket %i after a weaker or equal %i-second observation', async (bucket, seconds) => {
    const { user, article, post } = await fixture();
    const clock = bucket >= 3 ? old : null;
    await article.update({ firstSeen: old, attentionBucket: bucket, lastMeaningfulReadAt: clock });
    const response = await post('markasseen', { visibleSeconds: seconds });
    expect(response.status).toBe(200);
    expect(response.body.attentionBucket).toBe(bucket);
    await article.reload();
    expect(article.attentionBucket).toBe(bucket);
    expect(article.firstSeen).toEqual(old);
    expect(article.lastMeaningfulReadAt).toEqual(clock);
    expect(await db.ProcessingJob.count({ where: { userId: user.id } })).toBe(0);
  });

  it.each(['read', 'unread'])('keeps Event attention local while preserving navigation from the %s view', async selectedStatus => {
    const { user, article, post } = await fixture();
    const event = await db.Event.create({ userId: user.id, name: 'Occurrence', articleCount: 3, representativeArticleId: article.id });
    await article.update({ eventId: event.id, embedding_model: 'test-model', articleVector: [1, 0] });
    const siblings = await db.Article.bulkCreate(['B', 'C'].map(title => ({
      userId: user.id, feedId: article.feedId, title, eventId: event.id, embedding_model: 'test-model', articleVector: [1, 0], publishedAt: old
    })));
    const response = await post('markasseen', { visibleSeconds: 30, grouping: 'event', selectedStatus });
    expect(response.status).toBe(200);
    await article.reload();
    expect(article.attentionBucket).toBe(4);
    fresh(article.firstSeen);
    fresh(article.lastMeaningfulReadAt);
    for (const sibling of siblings) {
      await sibling.reload();
      expect(sibling.eventId).toBe(event.id);
      expect(sibling.firstSeen).toBeNull();
      expect(sibling.attentionBucket).toBe(0);
      expect(sibling.lastMeaningfulReadAt).toBeNull();
      expect(computeArticleSignals(sibling).positiveSignals.deepReads).toBe(0);
      expect(computeArticleSignals(sibling).positiveScore).toBe(0);
      expect(sibling.status).toBe(selectedStatus === 'unread' ? 'read' : 'unread');
      if (selectedStatus === 'unread') expect(sibling.readAt).toEqual(article.readAt);
      else expect(sibling.readAt).toBeNull();
    }
    const profiles = await buildInterestIslandProfilesForUser(user.id);
    expect(profiles.flatMap(profile => profile.articles).map(row => row.articleId)).toEqual([article.id]);
    if (selectedStatus === 'unread') {
      expect(response.body.readArticleIds.sort()).toEqual([article.id, ...siblings.map(row => row.id)].sort());
      expect(response.body.eventArticleCount).toBe(3);
    } else expect(response.body).not.toHaveProperty('readArticleIds');
    await event.reload();
    expect(event.articleCount).toBe(3);
    expect(event.representativeArticleId).toBe(article.id);
  });
});
