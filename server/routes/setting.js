import express from 'express';
import settingController from '../controllers/setting.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/setting
router.get('/', userMiddleware.isLoggedIn, settingController.getSettings);
router.get('/islands', userMiddleware.isLoggedIn, settingController.getIslandsOverview);
router.get('/topics', userMiddleware.isLoggedIn, settingController.getTopicsOverview);
router.post('/', userMiddleware.isLoggedIn, settingController.setSettings);
router.patch('/theme', userMiddleware.isLoggedIn, settingController.setThemeMode);

export default router;
