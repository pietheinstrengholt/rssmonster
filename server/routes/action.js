import express from 'express';
import actionController from '../controllers/action.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/actions - Get all actions for the authenticated user
router.get('/', userMiddleware.isLoggedIn, actionController.getActions);

// POST /api/actions - Recreate all actions for the authenticated user
router.post('/', userMiddleware.isLoggedIn, actionController.createAction);

export default router;
