import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';

describe('WorkerLease model', () => {
  it('declares a fenced expiring singleton contract', () => {
    expect(db.WorkerLease.rawAttributes.key).toMatchObject({
      allowNull: false,
      primaryKey: true
    });
    expect(db.WorkerLease.rawAttributes.owner.allowNull).toBe(false);
    expect(db.WorkerLease.rawAttributes.leaseUntil.allowNull).toBe(false);
    expect(db.WorkerLease.options.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'worker_leases_expiry_idx', fields: ['leaseUntil'] })
    ]));
  });
});
