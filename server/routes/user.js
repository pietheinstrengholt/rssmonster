import express from 'express';
import userController from '../controllers/user.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/users
router.get('/', userMiddleware.isLoggedIn, userController.getUsers);
router.get('/:userId', userMiddleware.isLoggedIn, userController.getUser);
router.post('/:userId', userMiddleware.isLoggedIn, userController.postUsers);
router.delete('/:userId', userMiddleware.isLoggedIn, userController.deleteUser);

export default router;