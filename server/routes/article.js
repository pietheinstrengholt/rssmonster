import express from 'express';
import articleController from '../controllers/article.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/articles
router.get('/', userMiddleware.isLoggedIn, articleController.getArticles);
router.get('/:articleId', userMiddleware.isLoggedIn, articleController.getArticle);
router.post('/markasread', userMiddleware.isLoggedIn, articleController.markAsRead);
router.post('/markclicked', userMiddleware.isLoggedIn, articleController.markClicked);
router.post('/markclicked/:articleId', userMiddleware.isLoggedIn, articleController.markClicked);
router.post('/marknotinterested/:articleId', userMiddleware.isLoggedIn, articleController.markNotInterested);
router.post('/markmorelikethis/:articleId', userMiddleware.isLoggedIn, articleController.markMoreLikeThis);
router.post('/details', userMiddleware.isLoggedIn, articleController.articleDetails);
router.post('/markasseen/:articleId', userMiddleware.isLoggedIn, articleController.articleMarkAsSeen);
router.post('/marktounread/:articleId', userMiddleware.isLoggedIn, articleController.articleMarkToUnread);
router.post('/markasfavorite', userMiddleware.isLoggedIn, articleController.articleMarkAsFavorite);
router.post('/markasfavorite/:articleId', userMiddleware.isLoggedIn, articleController.articleMarkAsFavorite);
router.post('/markallasread', userMiddleware.isLoggedIn, articleController.articleMarkAllAsRead);

export default router;
