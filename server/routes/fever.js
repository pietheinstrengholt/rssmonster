const express = require('express');

const feverController = require('../controllers/fever');

const router = express.Router();

// GET /api/fever
router.get('/', feverController.getFever);
router.post('/', feverController.postFever);

module.exports = router;