import { beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

const { ProcessingJob, User, sequelize } = db;
let app;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const createUser = () => User.create({
  username: uniqueName('processing-status-controller-user'),
  password: 'hashed-password',
  feverCredentialHash: uniqueName('processing-status-controller-hash'),
  role: 'user'
});
const authHeaderFor = user => `Bearer ${jwt.sign({
  username: user.username,
  userId: user.id
}, getJwtSecret())}`;

describe('settings processing jobs status', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';
    app = (await import('../../app.js')).default;
    await sequelize.authenticate();
  }, 50_000);

  it.each([
    ['true', 'true', 'false', 'false', 'false', [true, true, true, true, true]],
    ['true', 'false', 'true', 'false', 'true', [true, false, false, true, false]],
    ['true', 'true', 'false', 'true', 'false', [true, true, true, false, true]],
    ['false', 'true', 'false', 'false', 'false', [false, false, false, false, false]],
    ['', 'true', 'false', 'false', 'false', [false, false, false, false, false]]
  ])('reports effective AI features for flags %s %s %s %s %s', async (master, assistant, classification, embeddings, labels, expected) => {
    vi.stubEnv('INFERENCE_AI_ENABLED', master);
    vi.stubEnv('INFERENCE_ASSISTANT_ENABLED', assistant);
    vi.stubEnv('SKIP_ARTICLE_CLASSIFICATION_ANALYSIS', classification);
    vi.stubEnv('SKIP_ARTICLE_EMBEDDINGS', embeddings);
    vi.stubEnv('SKIP_SEMANTIC_LABELING', labels);
    try {
      const user = await createUser();
      const response = await request(app).get('/api/setting/processing-jobs')
        .set('Authorization', authHeaderFor(user));
      expect(response.status).toBe(200);
      expect(response.body.features).toEqual(Object.fromEntries(
        ['inference', 'assistant', 'classification', 'embeddings', 'semanticLabeling']
          .map((key, index) => [key, expected[index]])
      ));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('authenticates and returns only the current user queue status', async () => {
    const [user, otherUser] = await Promise.all([createUser(), createUser()]);
    await Promise.all([
      ProcessingJob.create({
        type: 'article_enrichment',
        userId: user.id,
        dedupeKey: uniqueName('owned-processing-status'),
        payload: { prompt: 'owned private content' },
        status: 'pending',
        availableAt: new Date()
      }),
      ProcessingJob.create({
        type: 'semantic_label',
        userId: otherUser.id,
        dedupeKey: uniqueName('foreign-processing-status'),
        payload: { prompt: 'foreign private content' },
        status: 'dead',
        attempts: 5,
        completedAt: new Date(),
        availableAt: new Date()
      })
    ]);

    const response = await request(app)
      .get('/api/setting/processing-jobs')
      .set('Authorization', authHeaderFor(user));

    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({ pending: 1, dead: 0 });
    expect(response.body.types).toEqual([
      expect.objectContaining({ type: 'article_enrichment', pending: 1, dead: 0 })
    ]);
    expect(response.body.recentFailures).toEqual([]);
    expect(JSON.stringify(response.body)).not.toContain('private content');

    const unauthenticated = await request(app).get('/api/setting/processing-jobs');
    expect(unauthenticated.status).toBe(400);
  });

  it('retries a bounded owned batch and ignores caller-supplied owners and active jobs', async () => {
    const [user, otherUser] = await Promise.all([createUser(), createUser()]);
    const makeJob = (owner, status) => ({
      type: 'semantic_label', userId: owner.id, dedupeKey: uniqueName('retry'),
      payload: {}, status, attempts: 5, availableAt: new Date(),
      completedAt: new Date(), lastErrorCode: 'INFERENCE_UNAVAILABLE'
    });
    await ProcessingJob.bulkCreate(Array.from({ length: 101 }, () => makeJob(user, 'dead')));
    const retained = await Promise.all([
      ProcessingJob.create(makeJob(otherUser, 'dead')),
      ...['pending', 'running', 'succeeded', 'cancelled'].map(status =>
        ProcessingJob.create(makeJob(user, status)))
    ]);
    const response = await request(app).post('/api/setting/processing-jobs/retry')
      .set('Authorization', authHeaderFor(user))
      .send({ userId: otherUser.id, jobIds: retained.map(job => job.id) });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ requeuedCount: 100, recoveredCount: 0, remainingCount: 1 });
    for (const job of retained) {
      const status = job.status;
      expect((await job.reload()).status).toBe(status);
      expect(job.attempts).toBe(5);
    }
    const second = await request(app).post('/api/setting/processing-jobs/retry')
      .set('Authorization', authHeaderFor(user));
    expect(second.body).toEqual({ requeuedCount: 1, recoveredCount: 0, remainingCount: 0 });
    const empty = await request(app).post('/api/setting/processing-jobs/retry')
      .set('Authorization', authHeaderFor(user));
    expect(empty.body).toEqual({ requeuedCount: 0, recoveredCount: 0, remainingCount: 0 });
    expect((await request(app).post('/api/setting/processing-jobs/retry')).status).toBe(400);
  });

  it('clears only the current user succeeded and dead jobs', async () => {
    const [user, otherUser] = await Promise.all([createUser(), createUser()]);
    const availableAt = new Date();
    const createJob = (owner, status, suffix) => ProcessingJob.create({
      type: 'article_enrichment',
      userId: owner.id,
      dedupeKey: uniqueName(suffix),
      payload: {},
      status,
      attempts: status === 'pending' ? 0 : 1,
      availableAt,
      completedAt: ['succeeded', 'dead', 'cancelled'].includes(status) ? availableAt : null
    });
    const [succeeded, dead, pending, running, cancelled, foreignSucceeded, foreignDead] =
      await Promise.all([
        createJob(user, 'succeeded', 'owned-succeeded'),
        createJob(user, 'dead', 'owned-dead'),
        createJob(user, 'pending', 'owned-pending'),
        createJob(user, 'running', 'owned-running'),
        createJob(user, 'cancelled', 'owned-cancelled'),
        createJob(otherUser, 'succeeded', 'foreign-succeeded'),
        createJob(otherUser, 'dead', 'foreign-dead')
      ]);

    const response = await request(app)
      .delete('/api/setting/processing-jobs')
      .set('Authorization', authHeaderFor(user));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ deletedCount: 2 });
    await expect(ProcessingJob.findByPk(succeeded.id)).resolves.toBeNull();
    await expect(ProcessingJob.findByPk(dead.id)).resolves.toBeNull();
    for (const retained of [pending, running, cancelled, foreignSucceeded, foreignDead]) {
      await expect(ProcessingJob.findByPk(retained.id)).resolves.not.toBeNull();
    }

    const unauthenticated = await request(app).delete('/api/setting/processing-jobs');
    expect(unauthenticated.status).toBe(400);
  });
});
