import express from 'express';
import settingController from '../controllers/setting.js';
import processingFailureController from '../controllers/processingFailure.js';
import processingJobStatusController from '../controllers/processingJobStatus.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/setting
router.get('/', userMiddleware.isLoggedIn, settingController.getSettings);
router.get('/crawl-statistics', userMiddleware.isLoggedIn, settingController.getCrawlStatistics);
router.get('/islands', userMiddleware.isLoggedIn, settingController.getIslandsOverview);
router.get('/topics', userMiddleware.isLoggedIn, settingController.getTopicsOverview);
router.get('/official-sources', userMiddleware.isLoggedIn, settingController.getOfficialSources);
router.get(
  '/processing-jobs',
  userMiddleware.isLoggedIn,
  processingJobStatusController.getProcessingJobsStatus
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
