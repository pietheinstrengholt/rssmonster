import express from 'express';
import feedController from '../controllers/feed.js';
export const feedRoutes = express.Router();

// GET /api/feeds
feedRoutes.get('/', feedController.getFeeds);
feedRoutes.get('/:feedId', feedController.getFeed);
feedRoutes.put('/:feedId', feedController.updateFeed);
feedRoutes.delete('/:feedId', feedController.deleteFeed);
feedRoutes.post('/validate', feedController.validateFeed);
feedRoutes.post('/', feedController.newFeed);

export default feedRoutes;