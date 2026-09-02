import express from 'express';
import generatedFeedController from '../controllers/generatedFeed.js';
import userMiddleware from '../middleware/users.js';

export const router = express.Router();

router.get('/', userMiddleware.isLoggedIn, generatedFeedController.listGeneratedFeeds);
router.post('/', userMiddleware.isLoggedIn, generatedFeedController.createGeneratedFeed);
router.get('/:id', userMiddleware.isLoggedIn, generatedFeedController.getGeneratedFeed);
router.put('/:id', userMiddleware.isLoggedIn, generatedFeedController.updateGeneratedFeed);
router.delete('/:id', userMiddleware.isLoggedIn, generatedFeedController.deleteGeneratedFeed);
router.post(
  '/:id/regenerate-token',
  userMiddleware.isLoggedIn,
  generatedFeedController.regenerateGeneratedFeedToken
);

export default router;
