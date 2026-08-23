import express from 'express';
import agentController from '../controllers/agent.js';
import userMiddleware from "../middleware/users.js";
import { requireAssistantEnabled } from '../middleware/inferenceAvailability.js';

export const router = express.Router();

// POST /agent
router.post(
  '/',
  userMiddleware.isLoggedIn,
  requireAssistantEnabled,
  agentController.postAgent
);

export default router;
