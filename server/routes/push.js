import express from 'express';
import pushController from '../controllers/push.js';
import userMiddleware from '../middleware/users.js';

export const router = express.Router();

router.get('/configuration', userMiddleware.isLoggedIn, pushController.getConfiguration);
router.get('/subscription', userMiddleware.isLoggedIn, pushController.getSubscriptionStatus);
router.post('/subscription', userMiddleware.isLoggedIn, pushController.subscribe);
router.delete('/subscription', userMiddleware.isLoggedIn, pushController.unsubscribe);

export default router;
