// client/src/api/manager.js
import api from './client';

/**
 * Fetch overview data with current selection
 * Backend expects POST with body
 */
export const fetchOverview = (currentSelection) =>
  api.post('/manager/overview', {
    ...currentSelection,
    clusterView: String(currentSelection.clusterView)
  });

/**
 * Update category order
 */
export const updateCategoryOrder = (order) =>
  api.post('/manager/updateorder', { order });
