import express from 'express';
import mcpController from '../controllers/mcp.js';

export const router = express.Router();

// GET /mcp
router.get('/', mcpController.getMcp);
router.post('/', mcpController.postMcp);

export default router;