import express from 'express';
import feverController from '../controllers/fever.js';
export const feverRoutes = express.Router();

// GET /api/fever
feverRoutes.get('/', feverController.getFever);
feverRoutes.post('/', feverController.postFever);

export default feverRoutes;