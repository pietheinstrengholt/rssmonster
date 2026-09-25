import express from 'express';
import interestsController from '../controllers/interests.js';
import userMiddleware from '../middleware/users.js';

const router = express.Router();
router.get('/', userMiddleware.isLoggedIn, interestsController.list);
router.get('/:id', userMiddleware.isLoggedIn, interestsController.detail);
router.patch('/:id', userMiddleware.isLoggedIn, interestsController.update);
export default router;
