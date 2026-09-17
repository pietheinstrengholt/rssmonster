import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { disambiguateDuplicateIslandNamesForUser, normalizeIslandName } from '../../services/islands/islandNameDisambiguation.js';

const evidenceState = row => {
  const { label: _label, updatedAt: _updatedAt, ...state } = row.toJSON();
  return state;
};

async function history() {
  const user = await db.User.create({ username: `island-names-${randomUUID()}` });
  const rows = await db.Island.bulkCreate([
    { label: 'Technology', archivedInd: true, weight: 0.9 },
    { label: '  TECHNOLOGY  ', archivedInd: false, weight: -0.6 },
    { label: 'Technology: Variant', archivedInd: true, weight: 0.4 },
    { label: ' Energy ', archivedInd: true, weight: 0.3 },
    { label: 'energy', archivedInd: true, weight: -0.2 }
  ].map(values => ({
    userId: user.id, islandVector: [1, 0], embedding_model: 'test-model',
    positiveSignals: { stars: 1 }, populationAudit: [{ metrics: { relatedArticleCount: 1 } }],
    lastBehaviorAt: new Date('2026-01-01'), archivedAt: values.archivedInd ? new Date('2026-04-01') : null,
    ...values
  })));
  await Promise.all(rows.map(row => row.reload()));
  return { user, rows };
}

describe('Island names across archived history', () => {
  it('repairs active and archived collisions without changing evidence, identity, or another user', async () => {
    const { user, rows } = await history();
    const other = await db.User.create({ username: `island-names-other-${randomUUID()}` });
    const foreign = await db.Island.create({ userId: other.id, label: 'Technology', weight: 0.5 });
    const before = rows.map(evidenceState);
    const result = await disambiguateDuplicateIslandNamesForUser(user.id);
    await Promise.all(rows.map(row => row.reload()));
    expect(new Set(rows.map(row => normalizeIslandName(row.label))).size).toBe(rows.length);
    expect(rows[0].label).toBe('Technology');
    expect(rows[2].label).toBe('Technology: Variant');
    expect(rows.map(evidenceState)).toEqual(before);
    expect(result.renamed).toHaveLength(2);
    expect(result.archived).toEqual([]);
    expect((await foreign.reload()).label).toBe('Technology');
    await expect(disambiguateDuplicateIslandNamesForUser(user.id)).resolves.toEqual({ renamed: [], archived: [] });
  });

  it('rolls back label changes with the enclosing persistence transaction', async () => {
    const { user, rows } = await history();
    const before = rows.map(row => row.toJSON());
    await expect(db.sequelize.transaction(async transaction => {
      await disambiguateDuplicateIslandNamesForUser(user.id, { transaction });
      throw new Error('abort naming');
    })).rejects.toThrow('abort naming');
    await Promise.all(rows.map(row => row.reload()));
    expect(rows.map(row => row.toJSON())).toEqual(before);
  });
});
