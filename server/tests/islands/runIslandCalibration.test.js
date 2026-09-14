import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindAll: vi.fn(),
  islandFindAll: vi.fn(),
  islandCount: vi.fn(),
  taxonomyFindAll: vi.fn(),
  transaction: vi.fn(),
  query: vi.fn(),
  buildArticles: vi.fn(),
  buildAudit: vi.fn(),
  evolveMemberships: vi.fn(),
  persist: vi.fn(),
  score: vi.fn(),
  recordProcessingFailure: vi.fn(),
  enqueueSemanticLabels: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    User: { findAll: mocks.userFindAll },
    Island: { findAll: mocks.islandFindAll, count: mocks.islandCount },
    IslandTaxonomy: { findAll: mocks.taxonomyFindAll },
    Sequelize: { QueryTypes: { SELECT: 'SELECT' } },
    sequelize: {
      transaction: mocks.transaction,
      query: mocks.query
    }
  }
}));

vi.mock('../../services/score/scoreArticlesFromIslands.js', () => ({ default: mocks.score }));
vi.mock('../../services/islands/islandArticleProfiles.js', () => ({
  buildInterestIslandProfilesForUser: mocks.buildArticles
}));

vi.mock('../../services/islands/islandAudit.js', () => ({
  buildPopulationAuditEntry: mocks.buildAudit,
  appendPopulationAudit: (existing, entry) => [...(existing || []), entry]
}));

vi.mock('../../services/islands/islandPersistence.js', () => ({
  persistInterestIslandProfiles: mocks.persist
}));
vi.mock('../../services/observability/processingFailures.js', () => ({
  recordProcessingFailure: mocks.recordProcessingFailure
}));
vi.mock('../../services/semanticLabels/semanticLabelJobs.js', () => ({
  tryEnqueueGeneratedSemanticLabelJobsForUser: mocks.enqueueSemanticLabels
}));

import {
  calibrateIslandsFromBehavior,
  persistIslandProfilesForUser,
  runIslandCalibration,
  runIslandCalibrationForUser
} from '../../services/islands/runIslandCalibration.js';

describe('island calibration orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async callback => callback('tx'));
    mocks.userFindAll.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mocks.islandFindAll.mockResolvedValue([]);
    mocks.islandCount.mockResolvedValue(1);
    mocks.taxonomyFindAll.mockResolvedValue([]);
    mocks.query.mockResolvedValue([]);
    mocks.buildArticles.mockResolvedValue([]);

    mocks.buildAudit.mockResolvedValue({ audit: true });
    mocks.evolveMemberships.mockResolvedValue({ newMembershipCount: 0, removedMembershipCount: 0 });
    mocks.persist.mockResolvedValue([]);
    mocks.score.mockResolvedValue({ fallbackScoredCount: 0, updatedCount: 0 });
    mocks.recordProcessingFailure.mockResolvedValue(undefined);
    mocks.enqueueSemanticLabels.mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('summarizes persisted profile article counts and attached persistence metadata', async () => {
    const islands = [{ id: 4 }];
    islands.summary = { createdIslandCount: 1 };
    mocks.persist.mockResolvedValue(islands);
    const profiles = [{ articles: [{}, {}] }, {  }];

    await expect(persistIslandProfilesForUser(7, profiles, { maxIslands: 2 })).resolves.toEqual({
      userId: 7,
      islandCount: 1,
      articleCount: 2,
      persistenceSummary: { createdIslandCount: 1 },
      profiles
    });
    expect(mocks.persist).toHaveBeenCalledWith(7, profiles, 'tx', { maxIslands: 2 });
  });

  it('continues bulk behavior calibration after one user fails', async () => {
    mocks.buildArticles.mockImplementation(async userId => {
      if (userId === 2) throw new Error('profile failure');
      return [{ articles: [{ articleId: 9 }] }];
    });

    const result = await calibrateIslandsFromBehavior({ maxIslands: 3 });

    expect(result.userCount).toBe(2);
    expect(result.results).toHaveLength(1);
    expect(mocks.recordProcessingFailure).toHaveBeenCalledWith(expect.objectContaining({
      userId: 2,
      stage: 'island_calibration',
      severity: 'FATAL'
    }));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('user 2'), expect.any(Error));
  });

  it('runs behavior, scoring, and summary reporting for one user', async () => {
    const islands = [{ id: 1 }];
    islands.summary = { existingIslandCount: 2, createdIslandIds: [1] };
    mocks.buildArticles.mockResolvedValue([{ articles: [{ articleId: 3 }] }]);
    mocks.persist.mockResolvedValue(islands);
    mocks.score.mockResolvedValue({ fallbackScoredCount: 2, updatedCount: 6 });
    mocks.query
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([{  }]);

    const result = await runIslandCalibrationForUser(7);

    expect(result).toMatchObject({
      userId: 7,
      islandCount: 1,
      articleCount: 1,
      fallbackScoredCount: 2,
      rescoredArticleCount: 6
    });
    expect(mocks.islandCount).toHaveBeenCalled();
    expect(mocks.enqueueSemanticLabels).toHaveBeenCalledWith(7, {
      islandIds: [1]
    });
  });

  it('does not enqueue labels for existing islands during recalibration', async () => {
    const islands = [{ id: 4 }];
    islands.summary = { updatedIslandCount: 1, createdIslandIds: [] };
    mocks.persist.mockResolvedValue(islands);

    await runIslandCalibrationForUser(7);

    expect(mocks.enqueueSemanticLabels).not.toHaveBeenCalled();
  });

  it('continues full calibration after one user fails', async () => {
    mocks.buildArticles.mockImplementation(async userId => {
      if (userId === 2) throw new Error('calibration failure');
      return [];
    });

    const result = await runIslandCalibration();

    expect(result.userCount).toBe(2);
    expect(result.results).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('user 2'), expect.any(Error));
  });
});
