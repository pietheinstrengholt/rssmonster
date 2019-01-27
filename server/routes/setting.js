const express = require('express');

const settingController = require('../controllers/setting');

const router = express.Router();

// GET /api/setting
router.get('/', settingController.getSettings);

module.exports = router;