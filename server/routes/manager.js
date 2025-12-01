import express from 'express';
import managerController from '../controllers/manager.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/manager/overview
router.get('/overview', userMiddleware.isLoggedIn, managerController.getOverview);
router.post('/marktoread/:articleId', userMiddleware.isLoggedIn, managerController.articleMarkToRead);
router.post('/marktounread/:articleId', userMiddleware.isLoggedIn, managerController.articleMarkToUnread);
router.post('/markwithstar/:articleId', userMiddleware.isLoggedIn, managerController.articleMarkWithStar);
router.post('/details', userMiddleware.isLoggedIn, managerController.articleDetails);
router.post('/markallasread', userMiddleware.isLoggedIn, managerController.articleMarkAllAsRead);
router.post('/updateorder', userMiddleware.isLoggedIn, managerController.categoryUpdateOrder);
router.post('/changecategory', userMiddleware.isLoggedIn, managerController.feedChangeCategory);

export default router;