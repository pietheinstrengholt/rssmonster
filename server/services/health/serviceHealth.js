import db from '../../models/index.js';
import { checkDatabaseHealth } from './databaseHealth.js';
import { readCrawlWorkerHealthState } from '../../src/workers/crawlWorkerHealth.js';
import { readAiWorkerHealthState } from '../../src/workers/aiWorkerHealth.js';
import { isInferenceEnabled } from '../../config/intelligentFeatures.js';
import { getEmailConfigurationStatus } from '../../config/email.js';
import { getInferenceRequestConfig } from '../inference/inferenceClient.js';

const service = (id, label, status, detail) => ({ id, label, status, detail });

const workerHealth = async (id, label, reader) => {
  try {
    const result = await reader();
    const status = !result.healthy ? 'unhealthy'
      : result.state?.status === 'starting' ? 'starting'
        : result.state?.status === 'degraded' ? 'degraded' : 'healthy';
    return service(id, label, status, result.reason);
  } catch {
    // Missing files can mean separate containers without a shared health volume.
    return service(id, label, 'unknown', 'Worker heartbeat is unavailable to the web server.');
  }
};

const databaseHealth = async () => {
  try {
    const result = await checkDatabaseHealth(db.sequelize);
    return service('database', 'Database', result.tables === 'ready' ? 'healthy' : 'unhealthy',
      result.tables === 'ready' ? 'Connection and required tables are ready.' : 'Required tables are missing.');
  } catch {
    return service('database', 'Database', 'unhealthy', 'Database readiness check failed.');
  }
};

const inferenceHealth = async () => {
  if (!isInferenceEnabled()) return service('inference', 'Inference', 'disabled', 'Inference is disabled.');
  try {
    const { baseUrl, fetchImplementation } = getInferenceRequestConfig();
    const response = await fetchImplementation(`${baseUrl.replace(/\/$/, '')}/ready`, {
      signal: AbortSignal.timeout(3000)
    });
    const body = await response.json();
    if (response.ok && body.acceptingWork === true && body.state === 'ready') {
      return service('inference', 'Inference', 'healthy', 'Models are ready to accept work.');
    }
    return service('inference', 'Inference', body.state === 'starting' ? 'starting' : 'unhealthy',
      'Inference is not ready to accept work.');
  } catch {
    return service('inference', 'Inference', 'unhealthy', 'Inference readiness check failed or timed out.');
  }
};

// Read-only snapshot; historical failure totals do not establish current service health.
export const getServiceHealth = async () => {
  const email = getEmailConfigurationStatus();
  const services = await Promise.all([
    service('web', 'Web server', 'healthy', 'The web server is responding.'),
    databaseHealth(),
    workerHealth('crawler', 'Crawler', readCrawlWorkerHealthState),
    workerHealth('ai-worker', 'AI worker', readAiWorkerHealthState),
    inferenceHealth(),
    service('smtp', 'SMTP', !email.enabled ? 'disabled' : !email.configured ? 'unhealthy' : 'unknown',
      !email.enabled ? 'Email delivery is disabled.' : !email.configured
        ? 'Email configuration is incomplete or invalid.'
        : 'Email is configured; SMTP connectivity has not been checked by this snapshot.')
  ]);
  return { checkedAt: new Date().toISOString(), services };
};
