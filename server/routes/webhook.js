import express from 'express';
import webhookController from '../controllers/webhook.js';
import userMiddleware from '../middleware/users.js';

export const router = express.Router();

router.get('/', userMiddleware.isLoggedIn, webhookController.listWebhooks);
router.get('/:id', userMiddleware.isLoggedIn, webhookController.getWebhook);
router.post('/', userMiddleware.isLoggedIn, webhookController.createWebhook);
router.put('/:id', userMiddleware.isLoggedIn, webhookController.updateWebhook);
router.delete('/:id', userMiddleware.isLoggedIn, webhookController.deleteWebhook);

export default router;
