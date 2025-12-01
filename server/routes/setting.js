import express from 'express';
import settingController from '../controllers/setting.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/setting
router.get('/', userMiddleware.isLoggedIn, settingController.getSettings);
router.post('/', userMiddleware.isLoggedIn, settingController.setSettings);

export default router;