import express from 'express';
import articleController from '../controllers/article.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/articles
router.get('/', userMiddleware.isLoggedIn, articleController.getArticles);
router.get('/briefing', userMiddleware.isLoggedIn, articleController.getDailyBriefing);
router.get('/duplicates/:articleId', userMiddleware.isLoggedIn, articleController.getDuplicateArticles);
router.get('/:articleId/recommendations', userMiddleware.isLoggedIn, articleController.getArticleRecommendations);
router.get('/:articleId/developing-story', userMiddleware.isLoggedIn, articleController.getDevelopingStoryArticles);
router.get('/:articleId/story-sources', userMiddleware.isLoggedIn, articleController.getStorySourceArticles);
router.get('/:articleId', userMiddleware.isLoggedIn, articleController.getArticle);
router.post('/:articleId/tags', userMiddleware.isLoggedIn, articleController.articleAddTags);
router.delete('/:articleId/tags/:tagId', userMiddleware.isLoggedIn, articleController.articleRemoveTag);
router.post('/markasread', userMiddleware.isLoggedIn, articleController.markAsRead);
router.post('/sync-actions', userMiddleware.isLoggedIn, articleController.syncActions);
router.post('/mark-opened-original', userMiddleware.isLoggedIn, articleController.markOpenedOriginal);
router.post('/mark-opened-original/:articleId', userMiddleware.isLoggedIn, articleController.markOpenedOriginal);
// Compatibility routes share authorization, ownership checks and canonical writes.
router.post('/markclicked', userMiddleware.isLoggedIn, articleController.markOpenedOriginal);
router.post('/markclicked/:articleId', userMiddleware.isLoggedIn, articleController.markOpenedOriginal);
router.post('/marknotinterested/:articleId', userMiddleware.isLoggedIn, articleController.markNotInterested);
router.post('/markmorelikethis/:articleId', userMiddleware.isLoggedIn, articleController.markMoreLikeThis);
router.post('/details', userMiddleware.isLoggedIn, articleController.articleDetails);
router.post('/markasseen/:articleId', userMiddleware.isLoggedIn, articleController.articleMarkAsSeen);
router.post('/marktounread/:articleId', userMiddleware.isLoggedIn, articleController.articleMarkToUnread);
router.post('/mark-saved', userMiddleware.isLoggedIn, articleController.articleMarkAsSaved);
router.post('/mark-saved/:articleId', userMiddleware.isLoggedIn, articleController.articleMarkAsSaved);
router.post('/markasfavorite', userMiddleware.isLoggedIn, articleController.articleMarkAsSaved);
router.post('/markasfavorite/:articleId', userMiddleware.isLoggedIn, articleController.articleMarkAsSaved);
router.post('/markallasread', userMiddleware.isLoggedIn, articleController.articleMarkAllAsRead);

export default router;
