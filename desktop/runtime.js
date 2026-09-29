import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateDatabase, configureDesktopDatabase } from './database.js';

const staticDirectory = fileURLToPath(new URL('./dist', import.meta.url));

export const configureRuntime = async userData => {
  await mkdir(userData, { recursive: true });
  const secretsPath = path.join(userData, 'secrets.json');
  let secrets;
  try {
    secrets = JSON.parse(await readFile(secretsPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    secrets = {
      JWT_SECRET: randomBytes(32).toString('hex'),
      FEVER_CREDENTIAL_SECRET: randomBytes(32).toString('hex')
    };
    await writeFile(secretsPath, JSON.stringify(secrets), { flag: 'wx', mode: 0o600 });
  }
  for (const key of ['JWT_SECRET', 'FEVER_CREDENTIAL_SECRET']) {
    if (typeof secrets[key] !== 'string' || secrets[key].length < 32) {
      throw new Error(`Invalid ${key} in desktop secrets file`);
    }
    process.env[key] = secrets[key];
  }
  // Set these before importing any server module; deployment .env values cannot override them.
  Object.assign(process.env, {
    NODE_ENV: 'production',
    RSSMONSTER_MODE: 'desktop',
    DB_DIALECT: 'sqlite',
    DB_STORAGE: path.join(userData, 'rssmonster.sqlite'),
    AI_WORKER_HEALTH_FILE: path.join(userData, 'ai-worker-health.json'),
    EMAIL_ENABLED: 'false',
    ENABLE_HTTPS: 'false',
    ENABLE_DEVELOPMENT_LOGIN: 'false',
    DISABLE_LISTENER: 'false',
    TRUST_PROXY: 'false',
    VAPID_PUBLIC_KEY: '',
    VAPID_PRIVATE_KEY: ''
  });
};

export const startRuntime = async (userData, services = {}) => {
  await access(path.join(staticDirectory, 'index.html'));
  await configureRuntime(userData);
  let db;
  let server;
  let stopServer;
  let waitForActiveCrawls;
  let stopping;
  let inference;
  let worker;
  let ready;
  const stop = () => {
    stopping ??= (async () => {
      if (server) await stopServer(server);
      if (waitForActiveCrawls) await waitForActiveCrawls();
      await worker?.stop();
      await inference?.stop();
      await ready?.catch(() => {});
      if (db) await db.sequelize.close();
    })();
    return stopping;
  };

  try {
    if (services.startInference) {
      process.env.INFERENCE_API_KEY = randomBytes(32).toString('hex');
      process.env.INFERENCE_AI_ENABLED = 'true';
      process.env.INFERENCE_ASSISTANT_ENABLED = 'false';
      inference = await services.startInference(userData);
      process.env.INFERENCE_BASE_URL = inference.url;
    }
    ({ default: db } = await import('../server/models/index.js'));
    configureDesktopDatabase(db);
    await migrateDatabase(db);
    const application = await import('../server/app.js');
    stopServer = application.stopServer;
    ({ waitForActiveCrawls } = await import('../server/controllers/crawl.js'));
    server = await application.startServer({ host: '127.0.0.1', port: 0, staticDirectory });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(10_000) });
    if (!health.ok) throw new Error(`Server readiness failed: HTTP ${health.status}`);
    ready = inference ? inference.ready.then(async () => {
      if (!stopping) {
        const { clearInferenceStatus } = await import('../server/services/inference/status.js');
        clearInferenceStatus();
        worker = await services.startAiWorker(userData);
        if (stopping) await worker.stop();
      }
    }) : Promise.resolve();
    void ready.catch(() => {});
    return { origin, stop, ready };
  } catch (error) {
    await stop().catch(closeError => console.error('Startup cleanup failed:', closeError));
    throw error;
  }
};
