import api from './client';

/**
 * Create a new category
 */
export const createCategory = (name) =>
  api.post('/categories', { name });
