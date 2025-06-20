import express from 'express';
import articleController from '../controllers/article.js';
export const articleRoutes = express.Router();
import userMiddleware from "../middleware/users.js";

// GET /api/articles
articleRoutes.get('/', userMiddleware.isLoggedIn, articleController.getArticles);
articleRoutes.get('/:articleId', userMiddleware.isLoggedIn, articleController.getArticle);
articleRoutes.post('/', userMiddleware.isLoggedIn, articleController.postArticles);

export default articleRoutes;