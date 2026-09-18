import express from 'express';
import { getServicesHealth } from '../controllers/serviceHealth.js';
import settingController from '../controllers/setting.js';
import processingFailureController from '../controllers/processingFailure.js';
import processingJobStatusController from '../controllers/processingJobStatus.js';
import userMiddleware from "../middleware/users.js";

import { getInferenceRuntime, putInferenceRuntime, deleteInferenceRuntime, requireInferenceAdministrator, getInferenceSettings, putInferenceSettings, deleteInferenceSettings, testInferenceSettings } from '../controllers/inferenceSettings.js';

import { requireAdministrator } from '../middleware/administrator.js';
import * as serverSettings from '../controllers/serverSettings.js';
import * as oidcSettings from '../controllers/oidcSettings.js';
import * as crawlSettings from '../controllers/crawlSettings.js';
import * as pushSettings from '../controllers/pushSettings.js';
import * as smtpSettings from '../controllers/smtpSettings.js';

export const router = express.Router();
router.get('/server/crawl', userMiddleware.isLoggedIn, requireAdministrator, crawlSettings.get);
router.put('/server/crawl', userMiddleware.isLoggedIn, requireAdministrator, crawlSettings.put);
router.delete('/server/crawl', userMiddleware.isLoggedIn, requireAdministrator, crawlSettings.clear);
router.get('/server/push', userMiddleware.isLoggedIn, requireAdministrator, pushSettings.get);
router.put('/server/push', userMiddleware.isLoggedIn, requireAdministrator, pushSettings.put);
router.delete('/server/push', userMiddleware.isLoggedIn, requireAdministrator, pushSettings.clear);
router.get('/server/oidc', userMiddleware.isLoggedIn, requireAdministrator, oidcSettings.get);
router.put('/server/oidc', userMiddleware.isLoggedIn, requireAdministrator, oidcSettings.put);
router.delete('/server/oidc', userMiddleware.isLoggedIn, requireAdministrator, oidcSettings.clear);
router.get('/server/smtp', userMiddleware.isLoggedIn, requireAdministrator, smtpSettings.get);
router.put('/server/smtp', userMiddleware.isLoggedIn, requireAdministrator, smtpSettings.put);
router.delete('/server/smtp', userMiddleware.isLoggedIn, requireAdministrator, smtpSettings.clear);
router.get('/server', userMiddleware.isLoggedIn, requireAdministrator, serverSettings.get);
router.put('/server', userMiddleware.isLoggedIn, requireAdministrator, serverSettings.put);
router.use('/inference', userMiddleware.isLoggedIn, requireInferenceAdministrator);
router.get('/inference/runtime', getInferenceRuntime);
router.put('/inference/runtime', putInferenceRuntime);
router.delete('/inference/runtime', deleteInferenceRuntime);
router.get('/inference', getInferenceSettings);
router.put('/inference', putInferenceSettings);
router.delete('/inference', deleteInferenceSettings);
router.post('/inference/test', testInferenceSettings);

// GET /api/setting
router.get('/', userMiddleware.isLoggedIn, settingController.getSettings);
router.get('/observability/health', userMiddleware.isLoggedIn, getServicesHealth);
router.get('/crawl-statistics', userMiddleware.isLoggedIn, settingController.getCrawlStatistics);
router.get('/islands', userMiddleware.isLoggedIn, settingController.getIslandsOverview);
router.post('/islands/recalculate', userMiddleware.isLoggedIn, settingController.recalculateIslands);
router.get('/events', userMiddleware.isLoggedIn, settingController.getEventsOverview);
router.get('/official-sources', userMiddleware.isLoggedIn, settingController.getOfficialSources);
router.get(
  '/processing-jobs',
  userMiddleware.isLoggedIn,
  processingJobStatusController.getProcessingJobsStatus
);
router.post(
  '/processing-jobs/retry',
  userMiddleware.isLoggedIn,
  processingJobStatusController.retryFailedProcessingJobs
);
router.delete(
  '/processing-jobs',
  userMiddleware.isLoggedIn,
  processingJobStatusController.clearCompletedProcessingJobs
);
router.get(
  '/observability',
  userMiddleware.isLoggedIn,
  processingFailureController.getProcessingFailureGroups
);
router.get(
  '/observability/groups/:fingerprint',
  userMiddleware.isLoggedIn,
  processingFailureController.getProcessingFailureOccurrences
);
router.get(
  '/observability/failures/:failureId',
  userMiddleware.isLoggedIn,
  processingFailureController.getProcessingFailureDetail
);
router.delete(
  '/observability',
  userMiddleware.isLoggedIn,
  processingFailureController.clearProcessingFailures
);
router.post('/', userMiddleware.isLoggedIn, settingController.setSettings);
router.post('/official-sources', userMiddleware.isLoggedIn, settingController.setOfficialSources);
router.patch('/developing-events', userMiddleware.isLoggedIn, settingController.setIncludeDevelopingEvents);
router.patch('/article-links', userMiddleware.isLoggedIn, settingController.setOpenArticleLinksInNewTab);
router.patch('/theme', userMiddleware.isLoggedIn, settingController.setThemeMode);
router.patch('/startup-view', userMiddleware.isLoggedIn, settingController.setStartupViewMode);
router.patch(
  '/mark-as-read-on-scroll',
  userMiddleware.isLoggedIn,
  settingController.setMarkAsReadOnScroll
);
router.patch(
  '/prioritize-high-trust',
  userMiddleware.isLoggedIn,
  settingController.setPrioritizeHighTrust
);

export default router;
