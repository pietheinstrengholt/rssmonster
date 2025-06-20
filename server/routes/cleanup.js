import express from 'express';
import cleanupController from '../controllers/cleanup.js';
export const cleanupRoutes = express.Router();
import userMiddleware from "../middleware/users.js";

// POST /api/cleanup
cleanupRoutes.post('/', userMiddleware.isLoggedIn, cleanupController.cleanup);

export default cleanupRoutes;