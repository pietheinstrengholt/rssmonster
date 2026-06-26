import api from './client';

/**
 * Create a new category
 */
export const createCategory = (name, iconName) =>
  api.post('/categories', { name, iconName });

/**
 * Update a category
 */
export const updateCategory = (categoryId, name, iconName) =>
  api.put(`/categories/${categoryId}`, { name, iconName });

/**
 * Delete a category
 */
export const deleteCategory = (categoryId) =>
  api.delete(`/categories/${categoryId}`);
