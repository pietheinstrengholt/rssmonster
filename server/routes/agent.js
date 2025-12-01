import express from 'express';
import agentController from '../controllers/agent.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// POST /agent
router.post('/', userMiddleware.isLoggedIn, agentController.postAgent);

export default router;