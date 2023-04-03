import express from 'express';
import categoryController from '../controllers/category.js';
export const categoryRoutes = express.Router();

// GET /api/categories
categoryRoutes.get('/', categoryController.getCategories);
categoryRoutes.get('/:categoryId', categoryController.getCategory);
categoryRoutes.put('/:categoryId', categoryController.updateCategory);
categoryRoutes.delete('/:categoryId', categoryController.deleteCategory);
categoryRoutes.post('/', categoryController.addCategory);

export default categoryRoutes;