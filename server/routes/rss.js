import express from 'express';
import rssController from '../controllers/rss.js';

const router = express.Router();

// Public RSS feed generated from stored articles
router.get('/', rssController.generateRss);

export default router;
