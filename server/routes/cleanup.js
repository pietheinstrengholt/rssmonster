import express from 'express';
import cleanupController from '../controllers/cleanup.js';
export const cleanupRoutes = express.Router();

// POST /api/cleanup
cleanupRoutes.post('/', cleanupController.cleanup);

export default cleanupRoutes;