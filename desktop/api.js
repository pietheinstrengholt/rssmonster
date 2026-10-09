import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
// Resolve the server's existing Express installation without adding a Desktop dependency.
const express = (await import(pathToFileURL(createRequire(new URL('../server/package.json', import.meta.url)).resolve('express')).href)).default;
import userMiddleware from '../server/middleware/users.js';
import { isCrawlPriorityLeaseActive } from '../server/services/jobs/crawlPriorityLease.js';
import { buildStaleCrawlRunWhere } from '../server/services/crawl/crawlRunHeartbeat.js';
import { requireAdministrator } from '../server/middleware/administrator.js';

export const readBackgroundActivity = async (db, background, userId) => {
  const scope = userId ? { userId } : {};
  const attributes = ['id', 'status', 'startedAt', 'completedAt', 'heartbeatAt', 'newArticles', 'failedFeeds', 'timedOutFeeds', 'errors'];
  const [running, latest, processing, criticalPipeline] = await Promise.all([
    db.CrawlRun.findOne({ where: { ...scope, status: 'running', [db.Sequelize.Op.not]: buildStaleCrawlRunWhere() }, attributes, order: [['startedAt', 'DESC']], raw: true }),
    db.CrawlRun.findOne({ where: { ...scope, status: { [db.Sequelize.Op.in]: ['completed', 'failed'] } }, attributes, order: [['completedAt', 'DESC']], raw: true }),
    db.ProcessingJob.count({ where: { ...scope, status: 'running' } }),
    isCrawlPriorityLeaseActive()
  ]);
  const worker = background.getState();
  const failed = latest?.status === 'failed' || latest?.failedFeeds > 0 || latest?.timedOutFeeds > 0 || latest?.errors > 0;
  const error = worker.workerStatus === 'error' || worker.workerStatus === 'degraded';
  const refreshing = Boolean(running);
  const processingArticles = processing > 0 || (criticalPipeline && !refreshing);
  const status = refreshing ? 'refreshing' : error ? 'error' : processingArticles ? 'processing' :
    worker.workerStatus === 'starting' ? 'starting' : failed ? 'error' : worker.automaticRefresh ? 'idle' : 'disabled';
  return {
    status, processingArticles,
    lastRefreshAt: latest?.completedAt || null,
    nextRefreshAt: worker.automaticRefresh ? worker.nextRefreshAt : null,
    newArticles: latest?.newArticles ?? null,
    failedFeeds: latest?.failedFeeds ?? null,
    schedulerError: error ? 'The background refresh worker failed. Use Refresh feeds now to retry.' : null
  };
};

export const createDesktopRouter = ({ settings, background, db }) => {
  const router = express.Router();
  router.use(userMiddleware.isLoggedIn);
  router.use((req, res, next) => Number.isSafeInteger(req.userData?.userId) && req.userData.userId > 0
    ? next() : res.status(403).json({ message: 'A local account is required.' }));
  router.get('/settings', requireAdministrator, (_req, res) => res.json(settings.get()));
  router.put('/settings', requireAdministrator, async (req, res) => {
    try { res.json(await settings.update(req.body)); } catch (error) { res.status(400).json({ message: error.message }); }
  });
  router.get('/activity', async (req, res) => res.json(await readBackgroundActivity(db, background, req.userData.userId)));
  return router;
};
