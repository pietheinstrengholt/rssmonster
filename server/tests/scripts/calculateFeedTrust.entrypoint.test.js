import { expect, it, vi } from 'vitest';
import db from '../../models/index.js';

it('can be imported without a CLI script argument, as in a packaged Electron launch', async () => {
  const originalArgv = process.argv;
  const findFeeds = vi.spyOn(db.Feed, 'findAll');
  try {
    process.argv = [process.execPath];
    const service = await import('../../scripts/calculateFeedTrust.js');
    expect(service.calculateFeedTrustForAllFeeds).toBeTypeOf('function');
    expect(findFeeds).not.toHaveBeenCalled();
  } finally {
    process.argv = originalArgv;
    findFeeds.mockRestore();
  }
});
