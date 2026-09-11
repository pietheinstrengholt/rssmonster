import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ database: vi.fn(), crawler: vi.fn(), ai: vi.fn(), health: vi.fn(), email: vi.fn() }));
vi.mock('../../models/index.js', () => ({ default: { sequelize: {} } }));
vi.mock('../../services/health/databaseHealth.js', () => ({ checkDatabaseHealth: mocks.database }));
vi.mock('../../src/workers/crawlWorkerHealth.js', () => ({ readCrawlWorkerHealthState: mocks.crawler }));
vi.mock('../../src/workers/aiWorkerHealth.js', () => ({ readAiWorkerHealthState: mocks.ai }));
vi.mock('../../config/email.js', () => ({ getEmailConfigurationStatus: mocks.email }));
vi.mock('../../services/ai/health.js', () => ({ getAIHealth: mocks.health }));
import { getServiceHealth } from '../../services/health/serviceHealth.js';

const statuses = result => Object.fromEntries(result.services.map(service => [service.id, service.status]));

describe('service health snapshot', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.database.mockResolvedValue({ tables: 'ready' });
    mocks.crawler.mockResolvedValue({ healthy: true, reason: 'healthy', state: { status: 'healthy' } });
    mocks.ai.mockResolvedValue({ healthy: true, reason: 'paused', state: { status: 'paused' } });
    mocks.email.mockReturnValue({ enabled: true, configured: true });
    mocks.health.mockResolvedValue({ enabled: true, reachable: true, ready: true, state: 'ready' });
  });

  it('uses readiness and heartbeats without claiming SMTP connectivity', async () => {
    expect(statuses(await getServiceHealth())).toEqual({ web: 'healthy', database: 'healthy', crawler: 'healthy', 'ai-worker': 'healthy', inference: 'healthy', smtp: 'unknown' });
    expect(mocks.health).toHaveBeenCalledOnce();
  });

  it('isolates failed checks and distinguishes missing from stale heartbeats', async () => {
    mocks.database.mockRejectedValue(new Error('private connection details'));
    mocks.crawler.mockRejectedValue(new Error('ENOENT'));
    mocks.ai.mockResolvedValue({ healthy: false, reason: 'AI worker health state is stale' });
    mocks.health.mockResolvedValue({ enabled: true, reachable: false, ready: false });
    mocks.email.mockReturnValue({ enabled: true, configured: false });
    const result = await getServiceHealth();
    expect(statuses(result)).toEqual({ web: 'healthy', database: 'unhealthy', crawler: 'unknown', 'ai-worker': 'unhealthy', inference: 'unhealthy', smtp: 'unhealthy' });
    expect(JSON.stringify(result)).not.toContain('private connection details');
  });

  it('does not contact disabled inference and reports startup separately', async () => {
    mocks.health.mockResolvedValue({ enabled: false });
    mocks.email.mockReturnValue({ enabled: false, configured: false });
    mocks.crawler.mockResolvedValue({ healthy: true, reason: 'starting', state: { status: 'starting' } });
    expect(statuses(await getServiceHealth())).toMatchObject({ inference: 'disabled', smtp: 'disabled', crawler: 'starting' });
    expect(mocks.health).toHaveBeenCalledOnce();
  });

  it('does not equate an HTTP success with model readiness', async () => {
    mocks.health.mockResolvedValue({ enabled: true, reachable: true, ready: false, state: 'starting' });
    expect(statuses(await getServiceHealth()).inference).toBe('starting');
  });
});
