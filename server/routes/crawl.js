import express from 'express';
import crawlController from '../controllers/crawl.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/crawl
router.get('/', userMiddleware.isLoggedIn,  crawlController.crawlRssLinks);

export default router;