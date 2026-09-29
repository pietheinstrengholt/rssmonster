import { fileURLToPath } from 'node:url';
import { localInferenceEnvironment } from './inference-config.js';

export const startServiceProcess = (utilityProcess, role, userData, environment, onFailure) => {
  const child = utilityProcess.fork(fileURLToPath(new URL('./service-process.js', import.meta.url)), [role], {
    cwd: userData, env: environment, stdio: 'pipe', serviceName: `RSSMonster ${role}`
  });
  child.stdout.on('data', data => process.stdout.write(data));
  child.stderr.on('data', data => process.stderr.write(data));
  let stopping = false;
  let exited = false;
  let stoppingPromise;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // Startup may exit before the caller receives the listening message.
  void ready.catch(() => {});
  const stopped = new Promise(resolve => child.once('exit', code => {
    exited = true;
    const error = new Error(`Desktop ${role} exited (${code})`);
    rejectReady(error);
    if (!stopping) onFailure(error);
    resolve();
  }));
  return new Promise((resolve, reject) => {
    child.once('exit', code => reject(new Error(`Desktop ${role} failed to start (${code})`)));
    child.on('message', message => {
      if (message.type === 'ready') resolveReady();
      if (message.type !== 'listening') return;
      resolve({ url: message.url, ready, stop: () => {
        stoppingPromise ??= (async () => {
          stopping = true;
          if (exited) return;
          child.postMessage('stop');
          // The existing AI worker has a 30-second drain; allow it to finish before killing a stuck child.
          const timeout = setTimeout(() => child.kill(), 40_000);
          try { await stopped; } finally { clearTimeout(timeout); }
        })();
        return stoppingPromise;
      } });
    });
  });
};

export const createDesktopServices = (utilityProcess, onFailure) => ({
  startInference: userData => startServiceProcess(utilityProcess, 'inference', userData,
    localInferenceEnvironment(userData), onFailure),
  startAiWorker: userData => startServiceProcess(utilityProcess, 'ai-worker', userData,
    { ...process.env, PROCESSING_JOB_CONCURRENCY: '1' }, onFailure)
});
