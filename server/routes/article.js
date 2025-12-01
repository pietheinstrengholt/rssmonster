import express from 'express';
import articleController from '../controllers/article.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/articles
router.get('/', userMiddleware.isLoggedIn, articleController.getArticles);
router.get('/:articleId', userMiddleware.isLoggedIn, articleController.getArticle);
router.post('/markasread', userMiddleware.isLoggedIn, articleController.markAsRead);
router.post('/markclicked/:articleId', userMiddleware.isLoggedIn, articleController.markClicked);

export default router;