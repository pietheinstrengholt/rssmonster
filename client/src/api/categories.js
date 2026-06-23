import api from './client';

/**
 * Create a new category
 */
export const createCategory = (name) =>
  api.post('/categories', { name });

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
