import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import {
  PROCESSING_FAILURE_SEVERITIES,
  PROCESSING_FAILURE_TYPES
} from '../../models/processingFailure.js';

const { CrawlRun, ProcessingFailure, User } = db;

describe('ProcessingFailure model', () => {
  it('declares the append-only diagnostic contract', () => {
    expect(ProcessingFailure.rawAttributes.failureType.values)
      .toEqual(PROCESSING_FAILURE_TYPES);
    expect(ProcessingFailure.rawAttributes.severity.values)
      .toEqual(PROCESSING_FAILURE_SEVERITIES);
    expect(ProcessingFailure.rawAttributes.crawlRunId.allowNull).toBe(true);
    expect(ProcessingFailure.rawAttributes.executionId.allowNull).toBe(false);
    expect(ProcessingFailure.rawAttributes.userId.allowNull).toBe(false);
    expect(ProcessingFailure.rawAttributes.message.allowNull).toBe(false);
    expect(ProcessingFailure.rawAttributes.fingerprint.allowNull).toBe(false);
  });

  it('uses the existing user and crawl ownership associations', () => {
    expect(CrawlRun.associations.processingFailures).toMatchObject({
      as: 'processingFailures',
      foreignKey: 'crawlRunId'
    });
    expect(User.associations.processingFailures).toMatchObject({
      as: 'processingFailures',
      foreignKey: 'userId'
    });
    expect(ProcessingFailure.associations.crawlRun).toMatchObject({
      as: 'crawlRun',
      foreignKey: 'crawlRunId'
    });
    expect(ProcessingFailure.associations.user).toMatchObject({
      as: 'user',
      foreignKey: 'userId'
    });
  });
});
