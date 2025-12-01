import express from 'express';
import settingController from '../controllers/setting.js';
export const settingRoutes = express.Router();
import userMiddleware from "../middleware/users.js";

// GET /api/setting
settingRoutes.get('/', userMiddleware.isLoggedIn, settingController.getSettings);

// POST /api/setting
settingRoutes.post('/', userMiddleware.isLoggedIn, settingController.setSettings);

export default settingRoutes;