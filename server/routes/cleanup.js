import express from 'express';
import cleanupController from '../controllers/cleanup.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// POST /api/cleanup
router.post('/', userMiddleware.isLoggedIn, cleanupController.cleanup);
export default router;