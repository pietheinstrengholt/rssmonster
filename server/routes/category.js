import express from 'express';
import categoryController from '../controllers/category.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/categories
router.get('/', userMiddleware.isLoggedIn, categoryController.getCategories);
router.get('/:categoryId', userMiddleware.isLoggedIn, categoryController.getCategory);
router.put('/:categoryId', userMiddleware.isLoggedIn, categoryController.updateCategory);
router.delete('/:categoryId', userMiddleware.isLoggedIn, categoryController.deleteCategory);
router.post('/', userMiddleware.isLoggedIn, categoryController.addCategory);

export default router;