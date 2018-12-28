const express = require('express');

const articleController = require('../controllers/article');

const router = express.Router();

// GET /api/articles
router.get('/', articleController.getArticles);
router.get('/:articleId', articleController.getArticle);

module.exports = router;