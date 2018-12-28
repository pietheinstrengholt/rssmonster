const express = require('express');

const managerController = require('../controllers/manager');

const router = express.Router();

// GET /api/manager/overview
router.get('/overview', managerController.getOverview);
router.post('/marktoread/:articleId', managerController.articleMarkToRead);
router.post('/marktounread/:articleId', managerController.articleMarkToUnread);
router.post('/markwithstar/:articleId', managerController.articleMarkWithStar);
router.post('/details', managerController.articleDetails);
router.post('/markallasread', managerController.articleMarkAllAsRead);
router.post('/updateorder', managerController.categoryUpdateOrder);
router.post('/changecategory', managerController.feedChangeCategory);

module.exports = router;