import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { evaluateArticleInterest, loadIslandEvidence } from '../../services/islands/islandInterestConfidence.js';

describe('muted Island scoring participation', () => {
  it('excludes muted Islands and restores the unchanged score when unmuted', async () => {
    const user = await db.User.create({ username: `muted-island-${randomUUID()}` });
    const island = await db.Island.create({ userId: user.id, label: 'Space', weight: 0.8,
      islandVector: [1, 0], embedding_model: 'test-model', lastBehaviorAt: new Date() });
    const article = { id: 'held-out', articleVector: [1, 0], embedding_model: 'test-model' };
    const score = async () => {
      const context = await loadIslandEvidence(user.id);
      return { context, result: evaluateArticleInterest(article, context) };
    };
    const before = await score();
    expect(island.mutedInd).toBe(false);
    expect(before.context.islands.map(row => row.id)).toEqual([island.id]);
    expect(before.result.score).toBeGreaterThan(0);

    await island.update({ mutedInd: true });
    const muted = await score();
    expect(muted.context.islands).toEqual([]);
    expect(muted.result.score).toBe(0);
    expect(muted.result.paths).toEqual([]);
    expect(island.weight).toBeCloseTo(0.8);
    expect(island.archivedInd).toBe(false);
    expect(island.islandVector).toEqual([1, 0]);

    await island.update({ mutedInd: false });
    const restored = await score();
    expect(restored.context.islands.map(row => row.id)).toEqual([island.id]);
    expect(restored.result.score).toBe(before.result.score);
    expect(restored.result.paths).toEqual(before.result.paths);
  });
});
