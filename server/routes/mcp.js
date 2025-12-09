import express from 'express';
import mcpController from '../controllers/mcp.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /mcp
router.get('/', userMiddleware.isLoggedIn, mcpController.getMcp);
router.post('/', userMiddleware.isLoggedIn, mcpController.postMcp);

export default router;