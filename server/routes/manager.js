import express from 'express';
import managerController from '../controllers/manager.js';
export const managerRoutes = express.Router();
import userMiddleware from "../middleware/users.js";

// GET /api/manager/overview
managerRoutes.get('/overview', userMiddleware.isLoggedIn, managerController.getOverview);
managerRoutes.post('/marktoread/:articleId', userMiddleware.isLoggedIn, managerController.articleMarkToRead);
managerRoutes.post('/marktounread/:articleId', userMiddleware.isLoggedIn, managerController.articleMarkToUnread);
managerRoutes.post('/markwithstar/:articleId', userMiddleware.isLoggedIn, managerController.articleMarkWithStar);
managerRoutes.post('/details', userMiddleware.isLoggedIn, managerController.articleDetails);
managerRoutes.post('/markallasread', userMiddleware.isLoggedIn, managerController.articleMarkAllAsRead);
managerRoutes.post('/updateorder', userMiddleware.isLoggedIn, managerController.categoryUpdateOrder);
managerRoutes.post('/changecategory', userMiddleware.isLoggedIn, managerController.feedChangeCategory);

export default managerRoutes;