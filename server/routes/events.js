import express from 'express';
import eventsController from '../controllers/events.js';
import userMiddleware from "../middleware/users.js";

const router = express.Router();

router.post('/articles', userMiddleware.isLoggedIn, eventsController.getEventArticles);

export default router;
