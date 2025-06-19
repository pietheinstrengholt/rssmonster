import express from 'express';
import mcpController from '../controllers/mcp.js';
export const mcpRoutes = express.Router();

// GET /mcp
mcpRoutes.get('/', mcpController.getMcp);
mcpRoutes.post('/', mcpController.postMcp);

export default mcpRoutes;