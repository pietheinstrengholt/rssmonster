import express from 'express';
import articleController from '../controllers/article.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/articles
router.get('/', userMiddleware.isLoggedIn, articleController.getArticles);
router.get('/:articleId', userMiddleware.isLoggedIn, articleController.getArticle);
router.post('/markasread', userMiddleware.isLoggedIn, articleController.markAsRead);
router.post('/markclicked/:articleId', userMiddleware.isLoggedIn, articleController.markClicked);
router.post('/markopened/:articleId', userMiddleware.isLoggedIn, articleController.markOpened);
router.post('/marknotinterested/:articleId', userMiddleware.isLoggedIn, articleController.markNotInterested);
router.post('/details', userMiddleware.isLoggedIn, articleController.articleDetails);
router.post('/marktoseen/:articleId', userMiddleware.isLoggedIn, articleController.articleMarkToSeen);
router.post('/marktounread/:articleId', userMiddleware.isLoggedIn, articleController.articleMarkToUnread);
router.post('/markwithstar/:articleId', userMiddleware.isLoggedIn, articleController.articleMarkWithStar);
router.post('/markallasread', userMiddleware.isLoggedIn, articleController.articleMarkAllAsRead);

export default router;