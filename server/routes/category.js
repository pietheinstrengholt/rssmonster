const express = require('express');

const categoryController = require('../controllers/category');

const router = express.Router();

// GET /api/categories
router.get('/', categoryController.getCategories);
router.get('/:categoryId', categoryController.getCategory);
router.put('/:categoryId', categoryController.updateCategory);
router.delete('/:categoryId', categoryController.deleteCategory);
router.post('/', categoryController.addCategory);

module.exports = router;