const express = require('express');

const crawlController = require('../controllers/crawl');

const router = express.Router();

// GET /api/crawl
router.get('/', crawlController.crawl);

module.exports = router;