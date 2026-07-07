import express from 'express';
import topicsController from '../controllers/topics.js';
import userMiddleware from "../middleware/users.js";

const router = express.Router();

router.post('/articles', userMiddleware.isLoggedIn, topicsController.getTopicArticles);

export default router;
