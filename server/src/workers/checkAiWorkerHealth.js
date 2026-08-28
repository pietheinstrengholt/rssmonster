import { checkAiWorkerHealth } from './aiWorkerHealth.js';

try {
  const result = await checkAiWorkerHealth();
  if (!result.healthy) {
    console.error(`[AiWorkerHealth] Unhealthy: ${result.reason}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`[AiWorkerHealth] Unavailable: ${error.message}`);
  process.exitCode = 1;
}
