import express from 'express';
import briefingController from '../controllers/briefing.js';
import userMiddleware from '../middleware/users.js';

export const router = express.Router();

// GET /api/briefing/preferences
router.get('/preferences', userMiddleware.isLoggedIn, briefingController.getBriefingPreferences);

// PUT /api/briefing/preferences
router.put('/preferences', userMiddleware.isLoggedIn, briefingController.updateBriefingPreferences);

export default router;
