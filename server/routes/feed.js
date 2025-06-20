import express from 'express';
import feedController from '../controllers/feed.js';
export const feedRoutes = express.Router();
import userMiddleware from "../middleware/users.js";

// GET /api/feeds
feedRoutes.get('/', userMiddleware.isLoggedIn, feedController.getFeeds);
feedRoutes.get('/:feedId', userMiddleware.isLoggedIn, feedController.getFeed);
feedRoutes.put('/:feedId', userMiddleware.isLoggedIn, feedController.updateFeed);
feedRoutes.delete('/:feedId', userMiddleware.isLoggedIn, feedController.deleteFeed);
feedRoutes.post('/validate', userMiddleware.isLoggedIn, feedController.validateFeed);
feedRoutes.post('/', userMiddleware.isLoggedIn, feedController.newFeed);

export default feedRoutes;