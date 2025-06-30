import express from 'express';
import userController from '../controllers/user.js';
export const userRoutes = express.Router();
import userMiddleware from "../middleware/users.js";

// GET /api/users
userRoutes.get('/', userMiddleware.isLoggedIn, userController.getUsers);
userRoutes.get('/:userId', userMiddleware.isLoggedIn, userController.getUser);
userRoutes.post('/:userId', userMiddleware.isLoggedIn, userController.postUsers);
userRoutes.delete('/:userId', userMiddleware.isLoggedIn, userController.deleteUser);

export default userRoutes;