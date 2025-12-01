import express from 'express';
import crawlController from '../controllers/crawl.js';

export const router = express.Router();

// GET /api/crawl
router.get('/', crawlController.crawlRssLinks);

export default router;