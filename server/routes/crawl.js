import express from 'express';
import crawlController from '../controllers/crawl.js';
export const crawlRoutes = express.Router();

// GET /api/crawl
crawlRoutes.get('/', crawlController.crawlRssLinks);

export default crawlRoutes;