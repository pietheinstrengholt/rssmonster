import express from 'express';
import managerController from '../controllers/manager.js';
export const managerRoutes = express.Router();

// GET /api/manager/overview
managerRoutes.get('/overview', managerController.getOverview);
managerRoutes.post('/marktoread/:articleId', managerController.articleMarkToRead);
managerRoutes.post('/marktounread/:articleId', managerController.articleMarkToUnread);
managerRoutes.post('/markwithstar/:articleId', managerController.articleMarkWithStar);
managerRoutes.post('/details', managerController.articleDetails);
managerRoutes.post('/markallasread', managerController.articleMarkAllAsRead);
managerRoutes.post('/updateorder', managerController.categoryUpdateOrder);
managerRoutes.post('/changecategory', managerController.feedChangeCategory);

export default managerRoutes;