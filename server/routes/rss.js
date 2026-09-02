import express from 'express';
import rssController from '../controllers/rss.js';
import userMiddleware from '../middleware/users.js';

const router = express.Router();

// RSS feed generated from the authenticated user's stored articles
router.get('/', userMiddleware.isLoggedIn, rssController.generateRss);

// Public RSS feed authenticated by an opaque Generated Feed bearer token.
router.get('/generated/:token', rssController.generatePublicGeneratedFeed);

export default router;
