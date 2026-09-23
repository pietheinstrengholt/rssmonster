import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';

const { Category } = db;

describe('Category clustering behavior', () => {
  it('defaults to null', async () => {
    const category = Category.build({ userId: 1, name: 'Technology' });
    await category.validate();
    expect(category.clusteringBehavior).toBeNull();
    expect(category.pinned).toBe(false);
  });

  it.each([null, 'aggressive', 'moderate', 'conservative'])('accepts %s', async clusteringBehavior => {
    const category = Category.build({ userId: 1, name: 'Technology', clusteringBehavior });
    await category.validate();
    expect(category.toJSON().clusteringBehavior).toBe(clusteringBehavior);
  });

  it.each(['unsupported', '', 'AGGRESSIVE', 1, false, [], {}])('rejects %j', async clusteringBehavior => {
    const category = Category.build({ userId: 1, name: 'Technology', clusteringBehavior });
    await expect(category.validate()).rejects.toMatchObject({ name: 'SequelizeValidationError' });
  });
});
