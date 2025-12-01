import express from 'express';
import authController from '../controllers/auth.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// POST /api/auth
router.post('/register', userMiddleware.validateRegister, authController.register);
router.post('/login', authController.login);
router.post('/validate', userMiddleware.isLoggedIn, authController.validate);

export default router;