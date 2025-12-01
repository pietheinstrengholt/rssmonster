import express from 'express';
import feverController from '../controllers/fever.js';

export const router = express.Router();

// GET /api/fever
router.get('/', feverController.getFever);
router.post('/', feverController.postFever);

export default router;