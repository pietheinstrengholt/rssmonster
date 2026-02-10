import express from 'express';
import clusterController from '../controllers/cluster.js';
import userMiddleware from "../middleware/users.js";

const router = express.Router();

router.post('/articles', userMiddleware.isLoggedIn, clusterController.getClusterArticles);

export default router;
