import db from '../models/index.js';
const { Category, Feed } = db;

const getCategories = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }
    
    const categories = await Category.findAll({
      where: { userId },
      include: [{
        model: Feed,
        required: true
      }],
      order: [["categoryOrder", "ASC"], ["name", "ASC"]]
    });

    return res.status(200).json({ categories });
  } catch (err) {
    console.error('Error in getCategories:', err);
    return res.status(500).json({ error: err.message });
  }
};

const getCategory = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const { categoryId } = req.params;

    const category = await Category.findByPk(categoryId, {
      where: { userId },
      include: [{
        model: Feed,
        required: true
      }]
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    return res.status(200).json({ category });
  } catch (err) {
    console.error('Error in getCategory:', err);
    return res.status(500).json({ error: err.message });
  }
};

const addCategory = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const { name, categoryOrder } = req.body;

    const category = await Category.create({
      userId,
      name,
      categoryOrder
    });

    return res.status(201).json(category);
  } catch (err) {
    console.error('Error in addCategory:', err);
    return res.status(500).json({ error: err.message });
  }
};

const updateCategory = async (req, res, _next) => {
  try {

    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const { categoryId } = req.params;
    const { name, categoryOrder } = req.body;

    const category = await Category.findByPk(categoryId);

    if (!category) {
      return res.status(404).json({
        error: 'Category not found'
      });
    }

    await category.update({
      name,
      categoryOrder
    }, {
      where: { userId }
    });

    return res.status(200).json(category);
  } catch (err) {
    console.error('Error in updateCategory:', err);
    return res.status(500).json({ error: err.message });
  }
};

const deleteCategory = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const { categoryId } = req.params;

    const category = await Category.findByPk(categoryId, {
      where: { userId }
    });

    if (!category) {
      return res.status(404).json({
        error: 'Category not found'
      });
    }

    // Delete all feeds associated with this category
    await Feed.destroy({
      where: { categoryId: category.id }
    });

    // Delete the category
    await category.destroy();

    return res.status(204).send();
  } catch (err) {
    console.error('Error in deleteCategory:', err);
    return res.status(500).json({ error: err.message });
  }
};

export default {
  getCategories,
  getCategory,
  addCategory,
  updateCategory,
  deleteCategory
};