import express from 'express';
import articleController from '../controllers/article.js';
export const articleRoutes = express.Router();

// GET /api/articles
articleRoutes.get('/', articleController.getArticles);
articleRoutes.get('/:articleId', articleController.getArticle);
articleRoutes.post('/', articleController.postArticles);

export default articleRoutes;