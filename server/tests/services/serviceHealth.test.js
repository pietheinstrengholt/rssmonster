import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ database: vi.fn(), crawler: vi.fn(), ai: vi.fn(), fetch: vi.fn(), email: vi.fn(), enabled: vi.fn() }));
vi.mock('../../models/index.js', () => ({ default: { sequelize: {} } }));
vi.mock('../../services/health/databaseHealth.js', () => ({ checkDatabaseHealth: mocks.database }));
vi.mock('../../src/workers/crawlWorkerHealth.js', () => ({ readCrawlWorkerHealthState: mocks.crawler }));
vi.mock('../../src/workers/aiWorkerHealth.js', () => ({ readAiWorkerHealthState: mocks.ai }));
vi.mock('../../config/email.js', () => ({ getEmailConfigurationStatus: mocks.email }));
vi.mock('../../config/intelligentFeatures.js', () => ({ isInferenceEnabled: mocks.enabled }));
vi.mock('../../services/inference/inferenceClient.js', () => ({ getInferenceRequestConfig: () => ({ baseUrl: 'http://inference', fetchImplementation: mocks.fetch }) }));
import { getServiceHealth } from '../../services/health/serviceHealth.js';

const statuses = result => Object.fromEntries(result.services.map(service => [service.id, service.status]));

describe('service health snapshot', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.database.mockResolvedValue({ tables: 'ready' });
    mocks.crawler.mockResolvedValue({ healthy: true, reason: 'healthy', state: { status: 'healthy' } });
    mocks.ai.mockResolvedValue({ healthy: true, reason: 'paused', state: { status: 'paused' } });
    mocks.enabled.mockReturnValue(true);
    mocks.email.mockReturnValue({ enabled: true, configured: true });
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ state: 'ready', acceptingWork: true }) });
  });

  it('uses readiness and heartbeats without claiming SMTP connectivity', async () => {
    expect(statuses(await getServiceHealth())).toEqual({ web: 'healthy', database: 'healthy', crawler: 'healthy', 'ai-worker': 'healthy', inference: 'healthy', smtp: 'unknown' });
    expect(mocks.fetch).toHaveBeenCalledWith('http://inference/ready', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('isolates failed checks and distinguishes missing from stale heartbeats', async () => {
    mocks.database.mockRejectedValue(new Error('private connection details'));
    mocks.crawler.mockRejectedValue(new Error('ENOENT'));
    mocks.ai.mockResolvedValue({ healthy: false, reason: 'AI worker health state is stale' });
    mocks.fetch.mockRejectedValue(new Error('timeout'));
    mocks.email.mockReturnValue({ enabled: true, configured: false });
    const result = await getServiceHealth();
    expect(statuses(result)).toEqual({ web: 'healthy', database: 'unhealthy', crawler: 'unknown', 'ai-worker': 'unhealthy', inference: 'unhealthy', smtp: 'unhealthy' });
    expect(JSON.stringify(result)).not.toContain('private connection details');
  });

  it('does not contact disabled inference and reports startup separately', async () => {
    mocks.enabled.mockReturnValue(false);
    mocks.email.mockReturnValue({ enabled: false, configured: false });
    mocks.crawler.mockResolvedValue({ healthy: true, reason: 'starting', state: { status: 'starting' } });
    expect(statuses(await getServiceHealth())).toMatchObject({ inference: 'disabled', smtp: 'disabled', crawler: 'starting' });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('does not equate an HTTP success with model readiness', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ state: 'starting' }) });
    expect(statuses(await getServiceHealth()).inference).toBe('starting');
  });
});
