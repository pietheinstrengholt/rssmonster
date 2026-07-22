import express from 'express';
import settingController from '../controllers/setting.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/setting
router.get('/', userMiddleware.isLoggedIn, settingController.getSettings);
router.get('/crawl-statistics', userMiddleware.isLoggedIn, settingController.getCrawlStatistics);
router.get('/islands', userMiddleware.isLoggedIn, settingController.getIslandsOverview);
router.get('/topics', userMiddleware.isLoggedIn, settingController.getTopicsOverview);
router.get('/official-sources', userMiddleware.isLoggedIn, settingController.getOfficialSources);
router.post('/', userMiddleware.isLoggedIn, settingController.setSettings);
router.post('/official-sources', userMiddleware.isLoggedIn, settingController.setOfficialSources);
router.patch('/developing-events', userMiddleware.isLoggedIn, settingController.setIncludeDevelopingEvents);
router.patch('/theme', userMiddleware.isLoggedIn, settingController.setThemeMode);
router.patch('/startup-view', userMiddleware.isLoggedIn, settingController.setStartupViewMode);

export default router;
