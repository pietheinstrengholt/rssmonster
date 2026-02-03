import express from 'express';
import managerController from '../controllers/manager.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// POST /api/manager/overview
router.post('/overview', userMiddleware.isLoggedIn, managerController.getOverview);
router.post('/updateorder', userMiddleware.isLoggedIn, managerController.categoryUpdateOrder);
router.post('/changecategory', userMiddleware.isLoggedIn, managerController.feedChangeCategory);

export default router;