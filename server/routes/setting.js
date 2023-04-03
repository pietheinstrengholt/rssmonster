import express from 'express';
import settingController from '../controllers/setting.js';
export const settingRoutes = express.Router();

// GET /api/setting
settingRoutes.get('/', settingController.getSettings);

export default settingRoutes;