import express from 'express';
import agentController from '../controllers/agent.js';
export const agentRoutes = express.Router();

// POST /agent
agentRoutes.post('/', agentController.postAgent);

export default agentRoutes;