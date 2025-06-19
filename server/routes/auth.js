import express from 'express';
import authController from '../controllers/auth.js';
export const authRoutes = express.Router();
import userMiddleware from "../middleware/users.js";

// POST /api/auth
authRoutes.post('/register', userMiddleware.validateRegister, authController.register);
authRoutes.post('/login', authController.login);
authRoutes.get('/secret-route', userMiddleware.isLoggedIn, authController.secret);

export default authRoutes;