import { describe, expect, it, vi } from 'vitest';
import migration from '../../migrations/20260809004000-normalize-disabled-feed-schedules.js';

// Creates the minimal query interface used to verify migration intent.
const createQueryInterface = () => ({
  sequelize: { query: vi.fn().mockResolvedValue(undefined) }
});

describe('disabled feed schedule normalization migration', () => {
  it('clears legacy deadlines for feeds with automatic crawling disabled', async () => {
    const queryInterface = createQueryInterface();

    await migration.up(queryInterface);

    expect(queryInterface.sequelize.query).toHaveBeenCalledWith(
      'UPDATE `feeds` SET `nextFetchAt` = NULL WHERE `updateIntervalMinutes` = 0'
    );
  });

  it('restores a due deadline when rolling back', async () => {
    const queryInterface = createQueryInterface();

    await migration.down(queryInterface);

    expect(queryInterface.sequelize.query).toHaveBeenCalledWith(
      'UPDATE `feeds` SET `nextFetchAt` = CURRENT_TIMESTAMP WHERE `updateIntervalMinutes` = 0 AND `nextFetchAt` IS NULL'
    );
  });
});
