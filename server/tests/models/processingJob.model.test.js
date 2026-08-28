import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { PROCESSING_JOB_STATUSES } from '../../models/processingJob.js';

const { Article, ProcessingJob, User } = db;

describe('ProcessingJob model', () => {
  it('declares the durable queue lifecycle contract', () => {
    expect(ProcessingJob.rawAttributes.id).toMatchObject({
      allowNull: false,
      primaryKey: true
    });
    expect(ProcessingJob.rawAttributes.status.values).toEqual(PROCESSING_JOB_STATUSES);
    expect(ProcessingJob.rawAttributes.userId.allowNull).toBe(false);
    expect(ProcessingJob.rawAttributes.articleId.allowNull).toBe(true);
    expect(ProcessingJob.rawAttributes.payload.allowNull).toBe(false);
    expect(ProcessingJob.rawAttributes.attempts.defaultValue).toBe(0);
    expect(ProcessingJob.rawAttributes.maxAttempts.defaultValue).toBe(5);
    expect(ProcessingJob.rawAttributes.leaseOwner.allowNull).toBe(true);
  });

  it('declares claim, recovery, ownership, and deduplication indexes', () => {
    expect(ProcessingJob.options.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'processing_jobs_user_type_dedupe_unique',
        unique: true,
        fields: ['userId', 'type', 'dedupeKey']
      }),
      expect.objectContaining({
        name: 'processing_jobs_claim_idx',
        fields: ['status', 'priority', 'createdAt', 'availableAt', 'id']
      }),
      expect.objectContaining({
        name: 'processing_jobs_lease_recovery_idx',
        fields: ['status', 'leaseUntil', 'id']
      }),
      expect.objectContaining({
        name: 'processing_jobs_user_status_available_idx',
        fields: ['userId', 'status', 'availableAt']
      })
    ]));
  });

  it('uses the existing user and optional article ownership associations', () => {
    expect(User.associations.processingJobs).toMatchObject({
      as: 'processingJobs',
      foreignKey: 'userId'
    });
    expect(Article.associations.processingJobs).toMatchObject({
      as: 'processingJobs',
      foreignKey: 'articleId'
    });
    expect(ProcessingJob.associations.user).toMatchObject({
      as: 'user',
      foreignKey: 'userId'
    });
    expect(ProcessingJob.associations.article).toMatchObject({
      as: 'article',
      foreignKey: 'articleId'
    });
  });
});
