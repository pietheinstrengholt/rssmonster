import express from 'express';
import mcpController from '../controllers/mcp.js';
export const mcpRoutes = express.Router();
import userMiddleware from "../middleware/users.js";

// GET /mcp
mcpRoutes.get('/', userMiddleware.verifyUser, mcpController.getMcp);
mcpRoutes.post('/', userMiddleware.verifyUser, mcpController.postMcp);

export default mcpRoutes;