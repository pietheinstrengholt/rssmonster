import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { runIslandCalibrationForUser } from '../../services/islands/runIslandCalibration.js';
import { explainArticleInterests } from '../../services/score/scoreArticlesFromIslands.js';

const now = Date.parse('2026-09-19T12:00:00Z');
const day = 86400000;
const vector = index => Array.from({ length: 25 }, (_, i) => Number(i === index));
const calibrate = (userId, maxIslands = 20) => runIslandCalibrationForUser(userId, { maxIslands, generateLabels: false });
const active = userId => db.Island.findAll({ where: { userId, archivedInd: false }, order: [['id', 'ASC']] });
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

async function fixture() {
  const user = await db.User.create({ username: `collective-${randomUUID()}` });
  const category = await db.Category.create({ userId: user.id, name: 'Collective' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Collective', url: `https://${user.id}.example/rss` });
  const add = (index, fields = {}) => db.Article.create({ userId: user.id, feedId: feed.id,
    title: `Technical guide ${index}`, status: 'read', publishedAt: new Date(now),
    embedding_model: 'test-model', articleVector: vector(index), ...fields });
  return { user, add };
}

describe('collective Island selection', () => {
  it.each(['positive', 'negative'])('lets coherent %s reading evidence compete at capacity and generalize to held-out articles', async sign => {
    const { user, add } = await fixture();
    for (let i = 0; i < 20; i++) await add(i, { favoriteInd: 1, favoritedAt: new Date(now) });
    const heldVector = vector(20).map((value, index) => value * 0.8 + Number(index === 21) * 0.6);
    const held = await add(20, { status: 'unread', articleVector: heldVector });
    const unrelated = await add(22, { status: 'unread' });
    await calibrate(user.id);
    const initialIds = (await active(user.id)).map(row => row.id);
    expect(initialIds).toHaveLength(20);
    expect(Number((await held.reload()).interestScore)).toBe(0);

    // Older than the implicit fallback window: the held-out score needs a supported Island.
    for (let i = 0; i < 5; i++) await add(20, sign === 'positive'
      ? { attentionBucket: 3, lastMeaningfulReadAt: new Date(now - 30 * day) }
      : { negativeInd: 1, negativeFeedbackAt: new Date(now - 30 * day) });
    await add(23, { positiveInd: 1, positiveFeedbackAt: new Date(now), filteredInd: true });
    await calibrate(user.id);
    const rows = await active(user.id);
    expect(rows).toHaveLength(20);
    expect(rows.filter(row => initialIds.includes(row.id))).toHaveLength(19);
    const learned = rows.find(row => !initialIds.includes(row.id));
    expect(learned.supportArticleIds).toHaveLength(5);
    expect(learned.supportArticleIds).not.toContain(String(held.id));
    await held.reload();
    expect(Number(held.interestScore) * (sign === 'positive' ? 1 : -1)).toBeGreaterThan(0);
    expect(Number((await unrelated.reload()).interestScore)).toBe(0);
    const { results } = await explainArticleInterests(user.id, [held]);
    expect(results.get(String(held.id))).toMatchObject({ seedSelf: false,
      paths: [expect.objectContaining({ islandId: learned.id, matchType: 'vector-fallback', seedSelf: false })] });

    const finalIds = rows.map(row => row.id);
    await calibrate(user.id);
    expect((await active(user.id)).map(row => row.id)).toEqual(finalIds);
    expect(await db.Island.count({ where: { userId: user.id } })).toBe(21);
  });

  it('keeps an incumbent for a marginal challenger, then reuses the challenger ID when evidence becomes stronger', async () => {
    const { user, add } = await fixture();
    await add(0, { favoriteInd: 1, favoritedAt: new Date(now - day) });
    await calibrate(user.id, 1);
    const [incumbent] = await active(user.id);
    const challengerSource = await add(1, { favoriteInd: 1, favoritedAt: new Date(now) });
    await calibrate(user.id, 1);
    expect((await active(user.id)).map(row => row.id)).toEqual([incumbent.id]);
    const challenger = await db.Island.findOne({ where: { userId: user.id, archivedInd: true } });
    expect(challenger).not.toBeNull();
    expect(challenger.populationAudit.at(-1).lifecycle.at(-1).capacity.decidedBy).toBe('selectionStrength');
    vi.setSystemTime(now + 1000);
    await challengerSource.update({ positiveInd: 1, positiveFeedbackAt: new Date() });
    await calibrate(user.id, 1);
    expect((await active(user.id)).map(row => row.id)).toEqual([challenger.id]);
    expect(await db.Island.count({ where: { userId: user.id } })).toBe(2);
    await calibrate(user.id, 1);
    expect((await active(user.id)).map(row => row.id)).toEqual([challenger.id]);
  });

  it('does not let a single click evict even an aging supported incumbent, but accepts independent repeated behavior', async () => {
    const { user, add } = await fixture();
    await add(0, { attentionBucket: 3, lastMeaningfulReadAt: new Date(now - 89 * day) });
    await calibrate(user.id, 1);
    const [incumbent] = await active(user.id);
    await add(1, { clickedAmount: 1000, lastClickedAt: new Date(now) });
    await calibrate(user.id, 1);
    expect((await active(user.id)).map(row => row.id)).toEqual([incumbent.id]);
    vi.setSystemTime(now + 1000);
    await add(1, { clickedAmount: 1, lastClickedAt: new Date() });
    await calibrate(user.id, 1);
    const [replacement] = await active(user.id);
    expect(replacement.id).not.toBe(incumbent.id);
    expect(replacement.supportArticleIds).toHaveLength(2);
  });
});
