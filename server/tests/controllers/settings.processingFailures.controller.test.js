import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

const { ProcessingFailure, User, sequelize } = db;
let app;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createUser = () => User.create({
  username: uniqueName('processing-failure-user'),
  password: 'hashed-password',
  feverCredentialHash: uniqueName('processing-failure-hash'),
  role: 'user'
});

const authHeaderFor = user => `Bearer ${jwt.sign({
  username: user.username,
  userId: user.id
}, getJwtSecret())}`;

describe('settings processing failure observability', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';
    app = (await import('../../app.js')).default;
    await sequelize.authenticate();
  }, 50_000);

  it('aggregates, lists, and expands only authenticated user failures', async () => {
    const [user, otherUser] = await Promise.all([createUser(), createUser()]);
    const fingerprint = 'c'.repeat(64);
    const otherFingerprint = 'd'.repeat(64);
    const [firstFailure, latestFailure, otherFailure] = await ProcessingFailure.bulkCreate([
      {
        userId: user.id,
        stage: 'embedding',
        failureType: 'TIMEOUT',
        severity: 'ERROR',
        message: 'Embedding request timed out for article 10',
        articleId: 10,
        retryable: true,
        fingerprint,
        occurredAt: new Date(Date.now() - 60_000)
      },
      {
        userId: user.id,
        stage: 'embedding',
        failureType: 'TIMEOUT',
        severity: 'ERROR',
        code: 'ETIMEDOUT',
        errorName: 'TimeoutError',
        message: 'Embedding request timed out for article 11',
        stackTrace: 'TimeoutError: Embedding request timed out',
        articleId: 11,
        retryable: true,
        fingerprint,
        context: { provider: 'test-provider' },
        occurredAt: new Date()
      },
      {
        userId: otherUser.id,
        stage: 'embedding',
        failureType: 'ERROR',
        severity: 'FATAL',
        message: 'Other user failure',
        fingerprint: otherFingerprint,
        occurredAt: new Date()
      }
    ]);

    const groups = await request(app)
      .get('/api/setting/observability?days=7')
      .set('Authorization', authHeaderFor(user));

    expect(groups.status).toBe(200);
    expect(groups.body.summary).toMatchObject({
      totalOccurrences: 2,
      groupCount: 1,
      fatalOccurrences: 0,
      timeoutOccurrences: 2,
      retryableOccurrences: 2
    });
    expect(groups.body.groups).toEqual([
      expect.objectContaining({
        fingerprint,
        occurrenceCount: 2,
        latestFailureId: latestFailure.id,
        message: 'Embedding request timed out for article 11'
      })
    ]);
    expect(groups.body.availableStages).toContain('embedding');

    const occurrences = await request(app)
      .get(`/api/setting/observability/groups/${fingerprint}?days=7`)
      .set('Authorization', authHeaderFor(user));

    expect(occurrences.status).toBe(200);
    expect(occurrences.body.pagination.total).toBe(2);
    expect(occurrences.body.failures.map(failure => failure.id))
      .toEqual([latestFailure.id, firstFailure.id]);
    expect(occurrences.body.failures[0]).not.toHaveProperty('stackTrace');
    expect(occurrences.body.failures[0]).not.toHaveProperty('context');

    const detail = await request(app)
      .get(`/api/setting/observability/failures/${latestFailure.id}`)
      .set('Authorization', authHeaderFor(user));

    expect(detail.status).toBe(200);
    expect(detail.body.failure).toMatchObject({
      id: latestFailure.id,
      stackTrace: 'TimeoutError: Embedding request timed out',
      context: { provider: 'test-provider' }
    });

    const hiddenDetail = await request(app)
      .get(`/api/setting/observability/failures/${latestFailure.id}`)
      .set('Authorization', authHeaderFor(otherUser));
    expect(hiddenDetail.status).toBe(404);

    const cleanup = await request(app)
      .delete('/api/setting/observability')
      .set('Authorization', authHeaderFor(user));

    expect(cleanup.status).toBe(200);
    expect(cleanup.body).toEqual({ deletedCount: 2 });
    expect(await ProcessingFailure.count({ where: { userId: user.id } })).toBe(0);
    expect(await ProcessingFailure.count({ where: { userId: otherUser.id } })).toBe(1);
    expect(await ProcessingFailure.findByPk(otherFailure.id)).not.toBeNull();
  });
});
