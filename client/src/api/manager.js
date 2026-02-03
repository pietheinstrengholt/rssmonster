import api from './client';

/**
 * Update category order
 */
export const updateCategoryOrder = (order) =>
  api.post('/manager/updateorder', { order });