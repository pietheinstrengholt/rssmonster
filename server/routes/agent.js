import express from 'express';
import { requireAgentToolToken } from '../services/agent/toolAuthentication.js';
import { postAgentTool } from '../controllers/agentTools.js';
import agentController from '../controllers/agent.js';
import userMiddleware from "../middleware/users.js";
import { requireAssistantEnabled } from '../middleware/inferenceAvailability.js';

export const router = express.Router();

// Callback authorization is separate from application sessions.
router.post('/tools', requireAgentToolToken, requireAssistantEnabled, postAgentTool);

// POST /agent
router.post(
  '/',
  userMiddleware.isLoggedIn,
  requireAssistantEnabled,
  agentController.postAgent
);

export default router;
