import express from 'express';
import { getSettings, updateSettings } from '../controllers/sidebar.js';
import userMiddleware from '../middleware/users.js';

const router = express.Router();
router.get('/settings', userMiddleware.isLoggedIn, getSettings);
router.put('/settings', userMiddleware.isLoggedIn, updateSettings);
export default router;
