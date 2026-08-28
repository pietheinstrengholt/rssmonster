import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  withCrawlPriorityLease: vi.fn()
}));

vi.mock('../../services/jobs/crawlPriorityLease.js', () => ({
  withCrawlPriorityLease: mocked.withCrawlPriorityLease
}));

const { default: crawlController } = await import('../../controllers/crawl.js');

describe('API crawl priority', () => {
  beforeEach(() => {
    mocked.withCrawlPriorityLease.mockReset();
  });

  it('enters the critical-pipeline lease before an API crawl can start', async () => {
    const leaseError = Object.assign(new Error('critical pipeline busy'), {
      code: 'CRAWL_PRIORITY_LEASE_BUSY'
    });
    mocked.withCrawlPriorityLease.mockRejectedValue(leaseError);
    const next = vi.fn();
    const response = {
      json: vi.fn(),
      status: vi.fn()
    };
    response.json.mockReturnValue(response);
    response.status.mockReturnValue(response);

    await crawlController.crawlRssLinks(
      { userData: { userId: 42 } },
      response,
      next
    );

    expect(mocked.withCrawlPriorityLease).toHaveBeenCalledOnce();
    expect(mocked.withCrawlPriorityLease).toHaveBeenCalledWith(expect.any(Function));
    expect(next).toHaveBeenCalledWith(leaseError);
    expect(response.status).not.toHaveBeenCalled();
  });
});
