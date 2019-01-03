const Category = require("../models/category");
const Feed = require("../models/feed");

exports.getCategories = (req, res, next) => {
  Category.findAll({
      include: [{
        model: Feed,
        required: true
      }],
      order: ['category_order', 'name']
    })
    .then(categories => {
      console.log(categories);
      res.status(200).json({
        categories: categories
      });
    })
    .catch(err => {
      console.log(err);
      return res.status(500).json(err);
    });
};

exports.getCategory = (req, res, next) => {
  const categoryId = req.params.categoryId;
  Category.findByPk(categoryId, {
      include: [{
        model: Feed,
        required: true
      }]
    })
    .then(category => {
      console.log(category);
      res.status(200).json({
        category: category
      });
    })
    .catch(err => {
      console.log(err);
      return res.status(500).json(err);
    });
};

exports.addCategory = (req, res, next) => {
  const name = req.body.name;
  const category_order = req.body.category_order;
  Category.create({
      name: name,
      category_order: category_order
    })
    .then(result => {
      console.log(result);
      return res.status(200).json(result);
    })
    .catch(err => {
      console.log(err);
      return res.status(500).json(err);
    });
};

exports.updateCategory = (req, res, next) => {
  const categoryId = req.params.categoryId;
  const name = req.body.name;
  const category_order = req.body.category_order;
  Category.findByPk(categoryId)
    .then(category => {
      if (!category) {
        return res.status(404).json({
          message: 'Category not found',
        });
      }
      return category
        .update({
          name: req.body.name,
          category_order: req.body.category_order,
        })
        .then(() => res.status(200).json(category))
        .catch((error) => res.status(400).json(error));
    })
    .catch((error) => res.status(400).json(error));
};

exports.deleteCategory = (req, res, next) => {
  const categoryId = req.params.categoryId;
  Category.findByPk(categoryId)
    .then(category => {
      if (!category) {
        return res.status(400).json({
          message: 'Category not found',
        });
      }
      return category
        .destroy()
        .then(() => res.status(204).json({
          message: 'Deleted successfully',
        }))
        .catch((error) => res.status(400).json(error));
    })
    .catch((error) => res.status(400).json(error));
};