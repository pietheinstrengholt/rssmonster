import express from 'express';
import agentController from '../controllers/agent.js';
export const agentRoutes = express.Router();
import userMiddleware from "../middleware/users.js";

// POST /agent
agentRoutes.post('/', userMiddleware.isLoggedIn, agentController.postAgent);

export default agentRoutes;