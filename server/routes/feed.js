import express from 'express';
import feedController from '../controllers/feed.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/feeds
router.get('/', userMiddleware.isLoggedIn, feedController.getFeeds);
router.get('/:feedId', userMiddleware.isLoggedIn, feedController.getFeed);
router.put('/:feedId', userMiddleware.isLoggedIn, feedController.updateFeed);
router.delete('/:feedId', userMiddleware.isLoggedIn, feedController.deleteFeed);
router.post('/validate', userMiddleware.isLoggedIn, feedController.validateFeed);
router.post('/', userMiddleware.isLoggedIn, feedController.newFeed);
router.post('/:feedId/rediscover-rss',  userMiddleware.isLoggedIn, feedController.rediscoverFeedRss);

export default router;