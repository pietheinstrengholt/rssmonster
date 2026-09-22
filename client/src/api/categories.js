import api from './client';

/**
 * Create a new category
 */
export const createCategory = (name, iconName, clusteringBehavior = null) =>
  api.post('/categories', { name, iconName, clusteringBehavior });

/**
 * Update a category
 */
export const updateCategory = (categoryId, name, iconName, clusteringBehavior) =>
  api.put(`/categories/${categoryId}`, { name, iconName, clusteringBehavior });

/**
 * Delete a category
 */
export const deleteCategory = (categoryId) =>
  api.delete(`/categories/${categoryId}`);
