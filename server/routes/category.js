import express from 'express';
import categoryController from '../controllers/category.js';
export const categoryRoutes = express.Router();
import userMiddleware from "../middleware/users.js";

// GET /api/categories
categoryRoutes.get('/', userMiddleware.isLoggedIn, categoryController.getCategories);
categoryRoutes.get('/:categoryId', userMiddleware.isLoggedIn, categoryController.getCategory);
categoryRoutes.put('/:categoryId', userMiddleware.isLoggedIn, categoryController.updateCategory);
categoryRoutes.delete('/:categoryId', userMiddleware.isLoggedIn, categoryController.deleteCategory);
categoryRoutes.post('/', userMiddleware.isLoggedIn, categoryController.addCategory);

export default categoryRoutes;